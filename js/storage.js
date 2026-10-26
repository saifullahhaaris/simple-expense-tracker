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
      Promise.resolve().then(() => flushSyncQueue());
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


async function cacheCloudRecords(storeName, userId, cloudRecords) {
  const pending = (await localAll("syncQueue")).filter(item => item.user_id === userId && item.table === storeName);
  const pendingIds = new Set(pending.map(item => item.record_id));

  // Never delete a local record just because it is absent from a cloud response.
  // Older versions saved the local record and queue item separately; a failure
  // between those writes could leave a valuable local-only record. Absence alone
  // is not enough evidence that such a record is safe to discard.
  for (const record of cloudRecords || []) {
    // Do not overwrite a local edit that is still waiting in the sync queue.
    if (!pendingIds.has(record.id)) await localPut(storeName, record);
  }
}

async function enqueueSync(userId, table, operation, id, payload) {
  await dbRequest("syncQueue", "readwrite", store => store.put({
    queueId: makeId(), user_id: userId, table, operation, record_id: id,
    payload: payload ?? null, created_at: new Date().toISOString()
  }));
  emitSyncStatus("pending", "Changes saved on this device; waiting to sync.");
}

// Save a local record and its sync job in one IndexedDB transaction.
// This prevents a locally saved change from being left out of the queue if
// the browser closes or a storage operation fails between two separate writes.
async function saveRecordAndEnqueue(table, record) {
  if (!MONETA_STORES.includes(table) || table === "syncQueue") {
    throw new Error(`Unsupported local data store: ${table}`);
  }
  const db = await openMonetaDb();
  const queueItem = {
    queueId: makeId(), user_id: record.user_id, table, operation: "upsert",
    record_id: record.id, payload: record, created_at: new Date().toISOString()
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

// A deletion and its sync job are atomic too. If the browser fails, either
// both operations are committed or neither is, so a deletion is not forgotten.
async function deleteRecordAndEnqueue(table, userId, id) {
  if (!MONETA_STORES.includes(table) || table === "syncQueue") {
    throw new Error(`Unsupported local data store: ${table}`);
  }
  const db = await openMonetaDb();
  const queueItem = {
    queueId: makeId(), user_id: userId, table, operation: "delete",
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
    } else if (item.operation === "upsert") {
      // RLS remains the security boundary; a failed server write stays queued.
      const { error } = await supabaseClient.from(item.table)
        .upsert(item.payload, { onConflict: "id" });
      if (error) throw error;

      // The local record was committed together with this queue item. Do not
      // replace it with the response here: a newer local edit could have happened
      // while the request was in flight. A later cloud read can refresh server data.
      await localDelete("syncQueue", item.queueId);
      return;
    } else {
      throw new Error(`Unsupported sync operation: ${item.operation}`);
    }
  }

  await localDelete("syncQueue", item.queueId);
}

async function flushSyncQueue() {
  if (!navigator.onLine) return;
  if (syncInProgress) {
    syncRequested = true;
    return;
  }

  syncInProgress = true;
  syncRequested = false;
  let flushFailed = false;
  try {
    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError) throw sessionError;

    if (!session?.user) {
      console.info("Sync paused: no authenticated user available. Pending queue preserved.");
      emitSyncStatus("offline", "Waiting for sign-in to sync queued changes.");
      return;
    }

    const user = session.user;

    while (navigator.onLine) {
      const next = (await localAll("syncQueue"))
        .filter(item => item.user_id === user.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (!next) break;
      await syncOneQueueItem(user, next);
    }

    const remaining = (await localAll("syncQueue")).filter(item => item.user_id === user.id).length;
    emitSyncStatus(remaining ? "pending" : "synced",
      remaining ? `${remaining} change(s) waiting to sync.` : "All changes synchronized.");
  } catch (error) {
    flushFailed = true;
    console.warn("MonetaTracker sync is waiting:", error);
    emitSyncStatus("pending",
      `Sync failed: ${error?.message || "Unknown server error"}. Your local copy is retained; sign in or reconnect, then retry.`);
  } finally {
    syncInProgress = false;
    if (syncRequested && navigator.onLine && !flushFailed) {
      syncRequested = false;
      Promise.resolve().then(() => flushSyncQueue());
    }
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
      const { data, error } = await supabaseClient.from("transactions").select("*").eq("user_id", user.id)
        .order("date", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      await cacheCloudRecords("transactions", user.id, data || []);
      const local = await localRecordsFor("transactions", user.id);
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
      const { data, error } = await supabaseClient.from("categories").select("*").eq("user_id", user.id).order("name", { ascending: true });
      if (error) throw error;
      await cacheCloudRecords("categories", user.id, data || []);
      return await localRecordsFor("categories", user.id);
    } catch (error) { console.warn("Using locally cached categories:", error); }
  }
  return localRecordsFor("categories", user.id);
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
      const { data, error } = await supabaseClient.from("notes").select("*").eq("user_id", user.id).order("pinned", { ascending: false }).order("updated_at", { ascending: false });
      if (error) throw error;
      await cacheCloudRecords("notes", user.id, data || []);
      return (await localRecordsFor("notes", user.id)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.updated_at).localeCompare(String(a.updated_at)));
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
      const { data, error } = await supabaseClient.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
      if (error) throw error;
      await cacheCloudRecords("projects", user.id, data || []);
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
