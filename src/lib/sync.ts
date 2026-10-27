import type { PostgrestError, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { localAll, localDelete, localGet, localPut, openDb, queueAll, queueDelete, queuePut, transact } from "./db";
import type { BaseRecord, QueueItem, SyncStatus, TableMap, TableName } from "./types";

/* ------------------------------------------------------------------ status bus */

let lastStatus: SyncStatus = {
  status: typeof navigator !== "undefined" && navigator.onLine ? "syncing" : "offline",
  message: ""
};
const listeners = new Set<(s: SyncStatus) => void>();

export function emitSyncStatus(status: SyncStatus["status"], message: string): void {
  lastStatus = { status, message };
  listeners.forEach(fn => fn(lastStatus));
}
export const getSyncStatus = (): SyncStatus => lastStatus;
export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------------------------------------------ session */

export async function getCurrentUser(): Promise<User> {
  // getSession reads the persisted session locally, so it works offline.
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (session?.user) return session.user;
  if (navigator.onLine) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (user) return user;
  }
  const err = new Error("No active session found. Please sign in to sync your data.");
  err.name = "AuthSessionMissingError";
  throw err;
}

/* ------------------------------------------------------------------ helpers */

// `_cloud` (ISO time) marks a local record known to exist in Supabase. It distinguishes
// "deleted on another device" from "never uploaded" and is stripped before upload.
const LOCAL_ONLY_FIELDS = ["_cloud", "_deleted"] as const;
export function cloudPayload<T extends object>(record: T): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  for (const f of LOCAL_ONLY_FIELDS) delete clean[f];
  return clean;
}

let lastSeq = 0;
const nextSeq = () => (lastSeq = Math.max(lastSeq + 1, Date.now() * 1000));
const queueSortKey = (i: QueueItem) => i.seq ?? (Date.parse(i.created_at) * 1000 || 0);
const timeValue = (v: string | undefined) => {
  const t = Date.parse(v ?? "");
  return Number.isFinite(t) ? t : 0;
};
const makeId = () => crypto.randomUUID();
export { makeId };

export async function localRecordsFor<S extends TableName>(table: S, userId: string): Promise<TableMap[S][]> {
  return (await localAll(table)).filter(r => r.user_id === userId);
}

/* ------------------------------------------------------------------ pull (cloud -> local) */

// PostgREST returns at most 1000 rows per request; page through everything.
async function fetchAllRows<S extends TableName>(table: S, userId: string): Promise<TableMap[S][]> {
  const pageSize = 1000;
  const rows: TableMap[S][] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select("*").eq("user_id", userId)
      .order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as TableMap[S][]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function pullTable(table: TableName, userId: string): Promise<void> {
  const startedAt = new Date().toISOString();
  const rows = await fetchAllRows(table, userId);
  await cacheCloudRecords(table, userId, rows, startedAt);
}

async function cacheCloudRecords<S extends TableName>(
  table: S, userId: string, cloud: TableMap[S][], fetchStartedAt: string
): Promise<void> {
  const pending = (await queueAll()).filter(i => i.user_id === userId && i.table === table);
  const pendingIds = new Set(pending.map(i => i.record_id));
  const locals = new Map((await localRecordsFor(table, userId)).map(r => [r.id, r]));
  const stamp = new Date().toISOString();
  const cloudIds = new Set<string>();

  for (const record of cloud) {
    cloudIds.add(record.id);
    if (pendingIds.has(record.id)) continue; // never overwrite an unsynced local edit
    const local = locals.get(record.id);
    // A fetch that began before our own upload finished can be stale.
    if (local && timeValue(local.updated_at) > timeValue(record.updated_at)) continue;
    await localPut(table, { ...record, _cloud: stamp });
  }

  let healed = false;
  for (const local of locals.values()) {
    if (cloudIds.has(local.id) || pendingIds.has(local.id)) continue;
    if (local._cloud) {
      // Was in the cloud, now gone => deleted on another device.
      if (local._cloud < fetchStartedAt) await localDelete(table, local.id);
    } else {
      // Local-only record never confirmed in the cloud => upload it, never discard it.
      await saveRecordAndEnqueue(table, local);
      healed = true;
    }
  }
  if (healed) setTimeout(() => void flushSyncQueue(), 0);
}

async function markCloudSynced(table: TableName, id: string): Promise<void> {
  await transact([table], tx => {
    const store = tx.objectStore(table);
    const req = store.get(id);
    // read-modify-write in one transaction so a newer local edit is preserved
    req.onsuccess = () => {
      if (req.result) store.put({ ...req.result, _cloud: new Date().toISOString() });
    };
  });
}

/* ------------------------------------------------------------------ writes (local first + queue) */

export async function enqueueProfile(userId: string, payload: Record<string, unknown>): Promise<void> {
  await queuePut({
    queueId: makeId(), seq: nextSeq(), user_id: userId, table: "profile", operation: "update",
    record_id: userId, payload, created_at: new Date().toISOString()
  });
  emitSyncStatus("pending", "Changes saved on this device; waiting to sync.");
}

/** Save a record and its sync job atomically. */
export async function saveRecordAndEnqueue<S extends TableName>(table: S, record: TableMap[S]): Promise<void> {
  const item: QueueItem = {
    queueId: makeId(), seq: nextSeq(), user_id: record.user_id, table, operation: "upsert",
    record_id: record.id, payload: cloudPayload(record), created_at: new Date().toISOString()
  };
  await transact([table, "syncQueue"], tx => {
    tx.objectStore(table).put(record);
    tx.objectStore("syncQueue").put(item);
  });
  emitSyncStatus("pending", "Changes saved on this device; waiting to sync.");
}

/** Delete a record and queue the cloud deletion atomically. */
export async function deleteRecordAndEnqueue(table: TableName, userId: string, id: string): Promise<void> {
  const item: QueueItem = {
    queueId: makeId(), seq: nextSeq(), user_id: userId, table, operation: "delete",
    record_id: id, payload: null, created_at: new Date().toISOString()
  };
  await transact([table, "syncQueue"], tx => {
    tx.objectStore(table).delete(id);
    tx.objectStore("syncQueue").put(item);
  });
  emitSyncStatus("pending", "Changes saved on this device; waiting to sync.");
}

/** Delete a project; its transactions/notes stay but become unassigned (matches ON DELETE SET NULL). */
export async function deleteProjectAndEnqueue(userId: string, id: string): Promise<void> {
  const item: QueueItem = {
    queueId: makeId(), seq: nextSeq(), user_id: userId, table: "projects", operation: "delete",
    record_id: id, payload: null, created_at: new Date().toISOString()
  };
  await transact(["projects", "transactions", "notes", "syncQueue"], tx => {
    tx.objectStore("projects").delete(id);
    for (const name of ["transactions", "notes"] as const) {
      const store = tx.objectStore(name);
      const req = store.getAll();
      req.onsuccess = () => {
        for (const r of req.result as Array<BaseRecord & { project_id: string | null }>) {
          if (r.user_id === userId && r.project_id === id) store.put({ ...r, project_id: null });
        }
      };
    }
    tx.objectStore("syncQueue").put(item);
  });
  emitSyncStatus("pending", "Changes saved on this device; waiting to sync.");
}

export async function pendingCount(): Promise<number> {
  const user = await getCurrentUser();
  return (await queueAll()).filter(i => i.user_id === user.id).length;
}

export async function hasPendingProfile(userId: string): Promise<boolean> {
  return (await queueAll()).some(i => i.user_id === userId && i.table === "profile");
}

/* ------------------------------------------------------------------ push (local -> cloud) */

async function syncOneQueueItem(user: User, item: QueueItem): Promise<void> {
  if (item.user_id !== user.id) throw new Error("Refusing to sync a change for a different account.");

  if (item.table === "profile") {
    const { error } = await supabase.auth.updateUser({ data: item.payload ?? {} });
    if (error) throw error;
  } else if (item.operation === "delete") {
    const { error } = await supabase.from(item.table).delete().eq("id", item.record_id).eq("user_id", user.id);
    if (error) throw error;
    // RLS can make DELETE succeed while removing 0 rows. Verify, so it can't silently come back.
    const { data: still, error: verifyError } = await supabase.from(item.table).select("id")
      .eq("id", item.record_id).eq("user_id", user.id).maybeSingle();
    if (verifyError) throw verifyError;
    if (still) {
      throw Object.assign(
        new Error(`The cloud refused to delete this ${item.table} record. Check the DELETE policy on "${item.table}".`),
        { code: "MONETA_DELETE_REFUSED" }
      );
    }
  } else if (item.operation === "upsert") {
    const { error } = await supabase.from(item.table).upsert(cloudPayload(item.payload ?? {}), { onConflict: "id" });
    if (error) throw error;
    await markCloudSynced(item.table, item.record_id);
  } else {
    throw new Error(`Unsupported sync operation: ${item.operation}`);
  }
  await queueDelete(item.queueId);
}

// Errors carrying a Postgres/PostgREST code concern the data or policies: skip that item and
// keep going. Network/auth errors have no such code and pause the whole pass.
function isPermanentSyncError(error: unknown): boolean {
  const code = String((error as PostgrestError | undefined)?.code ?? "");
  if (!code) return false;
  return !["PGRST301", "PGRST302", "PGRST303"].includes(code);
}

async function repairMissingProjectReference(item: QueueItem): Promise<boolean> {
  const projectId = item.payload?.project_id;
  if (item.operation !== "upsert" || typeof projectId !== "string" || item.table === "projects" || item.table === "profile") return false;
  if (await localGet("projects", projectId)) return false; // exists locally, simply not synced yet
  await queuePut({ ...item, payload: { ...item.payload, project_id: null } });
  const local = await localGet(item.table, item.record_id);
  if (local) await localPut(item.table, { ...local, project_id: null });
  return true;
}

let syncInProgress = false;
let syncRequested = false;

async function runFlush(): Promise<void> {
  if (syncInProgress) { syncRequested = true; return; }
  syncInProgress = true;
  syncRequested = false;
  let failed = false;
  const blocked = new Map<string, Error>();
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session?.user) {
      emitSyncStatus("offline", "Waiting for sign-in to sync queued changes.");
      return;
    }
    const user = session.user;
    const queueFor = async () => (await queueAll()).filter(i => i.user_id === user.id);
    if ((await queueFor()).length) emitSyncStatus("syncing", "Synchronizing…");

    while (navigator.onLine) {
      const next = (await queueFor())
        .filter(i => !blocked.has(i.queueId))
        .sort((a, b) => queueSortKey(a) - queueSortKey(b))[0];
      if (!next) break;
      try {
        await syncOneQueueItem(user, next);
      } catch (error) {
        if ((error as PostgrestError)?.code === "23503" && await repairMissingProjectReference(next)) continue;
        if (!isPermanentSyncError(error)) throw error;
        console.warn(`Moneta: ${next.operation} on ${next.table} rejected; continuing.`, error);
        blocked.set(next.queueId, error as Error);
        await queuePut({ ...next, last_error: (error as Error).message, last_error_at: new Date().toISOString() });
      }
    }

    const remaining = (await queueFor()).length;
    if (blocked.size) {
      const first = [...blocked.values()][0];
      emitSyncStatus("pending",
        `Sync failed: ${blocked.size} change(s) were rejected by the cloud (${first?.message ?? "unknown error"}). Everything else was synced; rejected changes stay on this device and are retried.`);
    } else {
      emitSyncStatus(remaining ? "pending" : "synced",
        remaining ? `${remaining} change(s) waiting to sync.` : "All changes synchronized.");
    }
  } catch (error) {
    failed = true;
    console.warn("Moneta sync is waiting:", error);
    emitSyncStatus("pending",
      `Sync failed: ${(error as Error)?.message || "Unknown server error"}. Your local copy is retained; sign in or reconnect, then retry.`);
  } finally {
    syncInProgress = false;
    if (syncRequested && navigator.onLine && !failed) {
      syncRequested = false;
      setTimeout(() => void flushSyncQueue(), 0);
    }
  }
}

/** Drain the queue. Only one tab does so at a time (Web Locks API, when available). */
export async function flushSyncQueue(): Promise<void> {
  if (!navigator.onLine) return;
  if (syncInProgress) { syncRequested = true; return; }
  if (navigator.locks?.request) {
    await navigator.locks.request("moneta-sync-queue", { ifAvailable: true }, async lock => {
      if (lock) await runFlush();
    });
  } else {
    await runFlush();
  }
}

/* ------------------------------------------------------------------ engine start-up */

let started = false;
export function startSyncEngine(): void {
  if (started) return;
  started = true;
  void openDb();

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      emitSyncStatus("offline", "Signed out. Local changes remain stored until you sign in again.");
      return;
    }
    // Never call supabase-js synchronously inside this callback (deadlock risk).
    if (session?.user && ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "INITIAL_SESSION"].includes(event)) {
      setTimeout(() => void flushSyncQueue(), 0);
    }
  });

  window.addEventListener("online", () => {
    emitSyncStatus("syncing", "Connection restored. Synchronizing…");
    void flushSyncQueue();
  });
  window.addEventListener("offline", () => emitSyncStatus("offline", "Offline mode. Changes are saved on this device."));
  window.addEventListener("focus", () => void flushSyncQueue());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushSyncQueue();
  });
  if (!navigator.onLine) emitSyncStatus("offline", "Offline mode. Changes are saved on this device.");
  else void flushSyncQueue();
}
