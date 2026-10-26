// MonetaTracker offline-first storage layer.
// A successful local save is immediate; queued changes synchronize when online.
const MONETA_DB_NAME = "monetatracker-local-v1";
const MONETA_DB_VERSION = 2;
const MONETA_STORES = ["transactions", "categories", "notes", "projects", "syncQueue"];
let monetaDbPromise;
let syncInProgress = false;
let syncRequested = false;
let authStateListenerRegistered = false;

function registerAuthStateListener() {
  if (authStateListenerRegistered) return;
  authStateListenerRegistered = true;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      emitSyncStatus(
        "offline",
        "Signed out. Local changes remain stored until you sign in again."
      );
      return;
    }

    if (
      session?.user &&
      ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)
    ) {
      // Never call supabase-js from inside this callback directly (can deadlock);
      // defer to a fresh task.
      setTimeout(() => flushSyncQueue(), 0);
    }
  });
}

function openMonetaDb() {
  if (monetaDbPromise) return monetaDbPromise;
  monetaDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(MONETA_DB_NAME, MONETA_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ["transactions", "categories", "notes", "projects"]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("syncQueue")) db.createObjectStore("syncQueue", { keyPath: "queueId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local storage."));
  });
  return monetaDbPromise;
}

async function dbRequest(storeName, mode, operation) {
  const db = await openMonetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let request;
    try { request = operation(store); } catch (error) { reject(error); return; }
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }
  });
}

function localPut(store, record) { return dbRequest(store, "readwrite", s => s.put(record)); }
function localDelete(store, id) { return dbRequest(store, "readwrite", s => s.delete(id)); }
function localAll(store) { return dbRequest(store, "readonly", s => s.getAll()); }
function makeId() { return crypto.randomUUID(); }
function emitSyncStatus(status, message) {
  window.dispatchEvent(new CustomEvent("moneta-sync-status", { detail: { status, message } }));
}

async function getCurrentUser() {
  // getSession reads the persisted Supabase session locally, so it can work offline.
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  if (session?.user) return session.user;
  if (navigator.onLine) {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError) throw userError;
    if (user) return user;
  }
  const missingSessionError = new Error("No active Supabase auth session found. Please sign in to sync your data.");
  missingSessionError.name = "AuthSessionMissingError";
  throw missingSessionError;
}

async function localRecordsFor(store, userId) {
  const records = await localAll(store);
  return records.filter(record => record.user_id === userId);
}


// ---- Local-only metadata -------------------------------------------------
// `_cloud` (ISO time) marks a local record that is known to exist in Supabase.
// It lets us tell "deleted on another device" (was in the cloud, now gone) apart
// from "never uploaded" (no marker -> must be uploaded, never discarded).
// Local-only fields are stripped before anything is sent to Supabase.
const LOCAL_ONLY_FIELDS = ["_cloud", "_deleted"];
function cloudPayload(record) {
  const clean = { ...record };
  for (const field of LOCAL_ONLY_FIELDS) delete clean[field];
  return clean;
}
let lastQueueSeq = 0;
function nextQueueSeq() {
  lastQueueSeq = Math.max(lastQueueSeq + 1, Date.now() * 1000);
  return lastQueueSeq;
}
function queueSortKey(item) {
  return item.seq ?? (Date.parse(item.created_at) * 1000 || 0);
}
function timeValue(value) {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

// PostgREST returns at most 1000 rows per request. Without paging, larger tables
// were silently truncated, which would look like "deleted elsewhere" records.
async function fetchAllRows(table, userId) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseClient.from(table).select("*")
      .eq("user_id", userId).order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function pullTable(table, userId) {
  const startedAt = new Date().toISOString();
  const rows = await fetchAllRows(table, userId);
  await cacheCloudRecords(table, userId, rows, startedAt);
}

async function cacheCloudRecords(storeName, userId, cloudRecords, fetchStartedAt) {
  const pending = (await localAll("syncQueue")).filter(item => item.user_id === userId && item.table === storeName);
  const pendingIds = new Set(pending.map(item => item.record_id));
  const locals = new Map((await localRecordsFor(storeName, userId)).map(record => [record.id, record]));
  const stamp = new Date().toISOString();
  const cloudIds = new Set();

  for (const record of cloudRecords || []) {
    cloudIds.add(record.id);
    // Never overwrite a local edit that is still waiting in the queue.
    if (pendingIds.has(record.id)) continue;
    const local = locals.get(record.id);
    // A fetch that started before our own upload finished can return stale data.
    if (local && timeValue(local.updated_at) > timeValue(record.updated_at)) continue;
    await localPut(storeName, { ...record, _cloud: stamp });
  }

  let healed = false;
  for (const local of locals.values()) {
    if (cloudIds.has(local.id) || pendingIds.has(local.id)) continue;
    if (local._cloud) {
      // It was in the cloud before and is gone now: deleted on another device.
      // (Ignore anything confirmed after this fetch began; the response may predate it.)
      if (!fetchStartedAt || local._cloud < fetchStartedAt) await localDelete(storeName, local.id);
    } else {
      // Local-only record that was never confirmed in the cloud: upload it.
      await saveRecordAndEnqueue(storeName, local);
      healed = true;
    }
  }
  if (healed) setTimeout(() => flushSyncQueue(), 0);
}

async function markCloudSynced(table, id) {
  const db = await openMonetaDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(table, "readwrite");
    const store = tx.objectStore(table);
    const req = store.get(id);
    // Read-modify-write inside one transaction so a newer local edit is preserved.
    req.onsuccess = () => { if (req.result) store.put({ ...req.result, _cloud: new Date().toISOString() }); };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

async function enqueueSync(userId, table, operation, id, payload) {
  await dbRequest("syncQueue", "readwrite", store => store.put({
    queueId: makeId(), seq: nextQueueSeq(), user_id: userId, table, operation, record_id: id,
    payload: payload ?? null, created_at: new Date().toISOString()
  }));
  emitSyncStatus("pending", "Changes saved on this device; waiting to sync.");
}

// Save a local record and its sync job in one IndexedDB transaction.
async function saveRecordAndEnqueue(table, record) {
  if (!MONETA_STORES.includes(table) || table === "syncQueue") {
    throw new Error(`Unsupported local data store: ${table}`);
  }
  const db = await openMonetaDb();
  const queueItem = {
    queueId: makeId(), seq: nextQueueSeq(), user_id: record.user_id, table, operation: "upsert",
    record_id: record.id, payload: cloudPayload(record), created_at: new Date().toISOString()
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction([table, "syncQueue"], "readwrite");
    tx.objectStore(table).put(record);
    tx.objectStore("syncQueue").put(queueItem);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Could not save the record and its sync job."));
    tx.onabort = () => reject(tx.error || new Error("The local save was cancelled."));
  });
  emitSyncStatus("pending", "Changes saved on this device; waiting to sync.");
}

// A deletion and its sync job are atomic too.
async function deleteRecordAndEnqueue(table, userId, id) {
  if (!MONETA_STORES.includes(table) || table === "syncQueue") {
    throw new Error(`Unsupported local data store: ${table}`);
  }
  const db = await openMonetaDb();
  const queueItem = {
    queueId: makeId(), seq: nextQueueSeq(), user_id: userId, table, operation: "delete",
    record_id: id, payload: null, created_at: new Date().toISOString()
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction([table, "syncQueue"], "readwrite");
    tx.objectStore(table).delete(id);
    tx.objectStore("syncQueue").put(queueItem);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Could not save the deletion and its sync job."));
    tx.onabort = () => reject(tx.error || new Error("The local deletion was cancelled."));
  });
  emitSyncStatus("pending", "Changes saved on this device; waiting to sync.");
}

async function syncOneQueueItem(user, item) {
  if (item.user_id !== user.id) throw new Error("Refusing to sync a change for a different account.");

  if (item.table === "profile") {
    const { error } = await supabaseClient.auth.updateUser({ data: item.payload });
    if (error) throw error;
  } else {
    if (!MONETA_STORES.includes(item.table) || item.table === "syncQueue") {
      throw new Error(`Unsupported sync target: ${item.table}`);
    }

    if (item.operation === "delete") {
      const { error } = await supabaseClient.from(item.table).delete()
        .eq("id", item.record_id).eq("user_id", user.id);
      if (error) throw error;
      // Row Level Security can make a DELETE succeed while removing 0 rows.
      // Verify, otherwise the row silently comes back on the next refresh.
      const { data: stillThere, error: verifyError } = await supabaseClient.from(item.table)
        .select("id").eq("id", item.record_id).eq("user_id", user.id).maybeSingle();
      if (verifyError) throw verifyError;
      if (stillThere) {
        const refused = new Error(`The cloud refused to delete this ${item.table} record. Check the DELETE policy on "${item.table}".`);
        refused.code = "MONETA_DELETE_REFUSED";
        throw refused;
      }
    } else if (item.operation === "upsert") {
      const { error } = await supabaseClient.from(item.table)
        .upsert(cloudPayload(item.payload), { onConflict: "id" });
      if (error) throw error;
      // Do not replace the local record with a response (a newer local edit may exist);
      // just remember that it now exists in the cloud.
      await markCloudSynced(item.table, item.record_id);
    } else {
      throw new Error(`Unsupported sync operation: ${item.operation}`);
    }
  }

  await localDelete("syncQueue", item.queueId);
}

// Errors with a Postgres/PostgREST code are about the data or policies (retrying
// immediately won't help and must not block unrelated changes). Network/auth errors
// have no such code and stop the whole pass to be retried later.
function isPermanentSyncError(error) {
  const code = String(error?.code || "");
  if (!code) return false;
  if (["PGRST301", "PGRST302", "PGRST303"].includes(code)) return false; // JWT / auth
  return true;
}

async function repairMissingProjectReference(item) {
  if (item.operation !== "upsert" || !item.payload?.project_id) return false;
  const project = await dbRequest("projects", "readonly", s => s.get(item.payload.project_id));
  if (project) return false; // project still exists locally; it just has not synced yet
  // The project was deleted. Unlink instead of blocking this record forever.
  await dbRequest("syncQueue", "readwrite", s => s.put({ ...item, payload: { ...item.payload, project_id: null } }));
  const store = item.table;
  const local = await dbRequest(store, "readonly", s => s.get(item.record_id));
  if (local) await localPut(store, { ...local, project_id: null });
  return true;
}

async function runFlush() {
  if (syncInProgress) { syncRequested = true; return; }
  syncInProgress = true;
  syncRequested = false;
  let flushFailed = false;
  const blocked = new Map();
  try {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;

    if (!session?.user) {
      console.info("Sync paused: no authenticated user available. Pending queue preserved.");
      emitSyncStatus("offline", "Waiting for sign-in to sync queued changes.");
      return;
    }

    const user = session.user;
    const queueFor = async () => (await localAll("syncQueue")).filter(item => item.user_id === user.id);
    if ((await queueFor()).length) emitSyncStatus("syncing", "Synchronizing…");

    while (navigator.onLine) {
      const next = (await queueFor())
        .filter(item => !blocked.has(item.queueId))
        .sort((a, b) => queueSortKey(a) - queueSortKey(b))[0];
      if (!next) break;
      try {
        await syncOneQueueItem(user, next);
      } catch (error) {
        if (error?.code === "23503" && await repairMissingProjectReference(next)) continue;
        if (!isPermanentSyncError(error)) throw error;
        console.warn(`MonetaTracker: ${next.operation} on ${next.table} was rejected; continuing with other changes.`, error);
        blocked.set(next.queueId, error);
        await dbRequest("syncQueue", "readwrite", s => s.put({ ...next, last_error: error.message || String(error), last_error_at: new Date().toISOString() }));
      }
    }

    const remaining = (await queueFor()).length;
    if (blocked.size) {
      const first = [...blocked.values()][0];
      emitSyncStatus("pending", `Sync failed: ${blocked.size} change(s) were rejected by the cloud (${first?.message || "unknown error"}). Everything else was synced; rejected changes stay on this device and are retried.`);
    } else {
      emitSyncStatus(remaining ? "pending" : "synced",
        remaining ? `${remaining} change(s) waiting to sync.` : "All changes synchronized.");
    }
  } catch (error) {
    flushFailed = true;
    console.warn("MonetaTracker sync is waiting:", error);
    emitSyncStatus("pending",
      `Sync failed: ${error?.message || "Unknown server error"}. Your local copy is retained; sign in or reconnect, then retry.`);
  } finally {
    syncInProgress = false;
    if (syncRequested && navigator.onLine && !flushFailed) {
      syncRequested = false;
      setTimeout(() => flushSyncQueue(), 0);
    }
  }
}

// Only one tab at a time drains the queue (when the Web Locks API exists).
async function flushSyncQueue() {
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

window.addEventListener("online", () => {
  registerAuthStateListener();
  emitSyncStatus("syncing", "Connection restored. Synchronizing…");
  flushSyncQueue();
});
window.addEventListener("offline", () => emitSyncStatus("offline", "Offline mode. Changes are saved on this device."));
window.addEventListener("load", () => {
  registerAuthStateListener();
  if (navigator.onLine) flushSyncQueue();
});
window.addEventListener("focus", () => {
  registerAuthStateListener();
  if (navigator.onLine) flushSyncQueue();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && navigator.onLine) flushSyncQueue();
});

async function getFinancialStartDay() {
  const user = await getCurrentUser();
  const hasPendingProfile = (await localAll("syncQueue")).some(item => item.user_id === user.id && item.table === "profile");
  if (navigator.onLine && !hasPendingProfile) {
    try {
      const { data: { user: fresh } } = await supabaseClient.auth.getUser();
      const remoteDay = Number(fresh?.user_metadata?.financial_start_day);
      if (Number.isInteger(remoteDay) && remoteDay >= 1 && remoteDay <= 31) {
        localStorage.setItem(`moneta-financial-start-${user.id}`, String(remoteDay));
      }
    } catch (error) { console.warn("Could not refresh financial start day:", error); }
  }
  const cached = localStorage.getItem(`moneta-financial-start-${user.id}`);
  const day = Number(cached || user.user_metadata?.financial_start_day || 1);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
}

async function saveFinancialStartDay(day) {
  const startDay = Number(day);
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 31) throw new Error("Choose a day between 1 and 31.");
  const user = await getCurrentUser();
  localStorage.setItem(`moneta-financial-start-${user.id}`, String(startDay));
  await enqueueSync(user.id, "profile", "update", user.id, { financial_start_day: startDay });
  await flushSyncQueue();
  return { financial_start_day: startDay };
}

async function getTransactions() {
  const user = await getCurrentUser();
  if (navigator.onLine) {
    try {
      await pullTable("transactions", user.id);
      const local = (await localRecordsFor("transactions", user.id))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at).localeCompare(String(b.created_at)));
      return mergePendingRecords(local, "transactions", user.id);
    } catch (error) { console.warn("Using locally cached transactions:", error); }
  }
  return mergePendingRecords(await localRecordsFor("transactions", user.id), "transactions", user.id);
}

function mergePendingRecords(records, table, userId) {
  // Local records are the latest view; pending deletes are already absent locally.
  return records.filter(record => record.user_id === userId && !record._deleted);
}

async function saveRecord(table, record) {
  await saveRecordAndEnqueue(table, record);
  await flushSyncQueue();
  return record;
}

async function addTransaction({ date, description, category, type, amount, project_id = null }) {
  const user = await getCurrentUser();
  const now = new Date().toISOString();
  return saveRecord("transactions", { id: makeId(), user_id: user.id, date, description: description.trim(), category, type, amount: Number(amount), project_id: project_id || null, created_at: now, updated_at: now });
}

async function updateTransaction(id, { date, description, category, type, amount }) {
  const user = await getCurrentUser();
  const existing = (await localRecordsFor("transactions", user.id)).find(item => item.id === id);
  if (!existing) throw new Error("Transaction not found on this device. Connect to the internet and try again.");
  return saveRecord("transactions", { ...existing, date, description: description.trim(), category, type, amount: Number(amount), updated_at: new Date().toISOString() });
}

async function deleteTransaction(id) {
  const user = await getCurrentUser();
  await deleteRecordAndEnqueue("transactions", user.id, id);
  await flushSyncQueue();
}

async function getCategories() {
  const user = await getCurrentUser();
  if (navigator.onLine) {
    try {
      await pullTable("categories", user.id);
    } catch (error) { console.warn("Using locally cached categories:", error); }
  }
  return (await localRecordsFor("categories", user.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function addCategory(name) {
  const user = await getCurrentUser();
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Enter a category name.");
  const existing = await localRecordsFor("categories", user.id);
  if (existing.some(item => item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) throw new Error("That category already exists.");
  return saveRecord("categories", { id: makeId(), user_id: user.id, name: cleanName, created_at: new Date().toISOString() });
}

async function getStickyNotes() {
  const user = await getCurrentUser();
  if (navigator.onLine) {
    try {
      await pullTable("notes", user.id);
    } catch (error) { console.warn("Using locally cached notes:", error); }
  }
  return (await localRecordsFor("notes", user.id)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.updated_at).localeCompare(String(a.updated_at)));
}

async function saveStickyNote({ id, title, content, pinned = false, color = "yellow", project_id = null }) {
  const user = await getCurrentUser();
  const now = new Date().toISOString();
  const existing = id ? (await localRecordsFor("notes", user.id)).find(note => note.id === id) : null;
  const note = { ...(existing || {}), id: id || makeId(), user_id: user.id, title: title.trim(), content: content.trim(), pinned: Boolean(pinned), color, project_id: project_id ?? existing?.project_id ?? null, created_at: existing?.created_at || now, updated_at: now };
  return saveRecord("notes", note);
}

async function deleteStickyNote(id) {
  const user = await getCurrentUser();
  await deleteRecordAndEnqueue("notes", user.id, id);
  await flushSyncQueue();
}

async function getPendingSyncCount() {
  const user = await getCurrentUser();
  return (await localAll("syncQueue")).filter(item => item.user_id === user.id).length;
}


// Project CRUD shares the same offline-first queue as transactions and notes.
async function getProjects({ includeArchived = false } = {}) {
  const user = await getCurrentUser();
  if (navigator.onLine) {
    try {
      await pullTable("projects", user.id);
    } catch (error) { console.warn("Using locally cached projects:", error); }
  }
  const projects = await localRecordsFor("projects", user.id);
  return projects.filter(project => includeArchived || project.status !== "archived")
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
}

async function getProject(projectId) {
  return (await getProjects({ includeArchived: true })).find(project => project.id === projectId) || null;
}

async function saveProject({ id, name, description = "", budget = "", target_date = "", status = "active" }) {
  const user = await getCurrentUser();
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Enter a project name.");
  const existing = id ? (await localRecordsFor("projects", user.id)).find(project => project.id === id) : null;
  const now = new Date().toISOString();
  const project = { ...(existing || {}), id: id || makeId(), user_id: user.id, name: cleanName, description: String(description || "").trim(), budget: budget === "" || budget == null ? null : Number(budget), target_date: target_date || null, status, created_at: existing?.created_at || now, updated_at: now };
  if (project.budget !== null && (!Number.isFinite(project.budget) || project.budget < 0)) throw new Error("Budget must be a valid non-negative amount.");
  return saveRecord("projects", project);
}

// Deleting a project keeps its transactions and notes (they become unassigned),
// matching the database foreign key (ON DELETE SET NULL).
async function deleteProject(id) {
  const user = await getCurrentUser();
  const db = await openMonetaDb();
  const queueItem = {
    queueId: makeId(), seq: nextQueueSeq(), user_id: user.id, table: "projects", operation: "delete",
    record_id: id, payload: null, created_at: new Date().toISOString()
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "transactions", "notes", "syncQueue"], "readwrite");
    tx.objectStore("projects").delete(id);
    for (const name of ["transactions", "notes"]) {
      const store = tx.objectStore(name);
      const req = store.getAll();
      req.onsuccess = () => {
        for (const record of req.result) {
          if (record.user_id === user.id && record.project_id === id) store.put({ ...record, project_id: null });
        }
      };
    }
    tx.objectStore("syncQueue").put(queueItem);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error("Could not delete the project."));
  });
  emitSyncStatus("pending", "Changes saved on this device; waiting to sync.");
  await flushSyncQueue();
}
