// MonetaTracker offline-first storage layer.
// A successful local save is immediate; queued changes synchronize when online.
const MONETA_DB_NAME = "monetatracker-local-v1";
const MONETA_DB_VERSION = 1;
const MONETA_STORES = ["transactions", "categories", "notes", "syncQueue"];
let monetaDbPromise;
let syncInProgress = false;

function openMonetaDb() {
  if (monetaDbPromise) return monetaDbPromise;
  monetaDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(MONETA_DB_NAME, MONETA_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ["transactions", "categories", "notes"]) {
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
  throw new Error("You need to sign in online at least once on this device before using MonetaTracker offline.");
}

async function localRecordsFor(store, userId) {
  const records = await localAll(store);
  return records.filter(record => record.user_id === userId);
}


async function cacheCloudRecords(storeName, userId, cloudRecords) {
  const cloudIds = new Set((cloudRecords || []).map(record => record.id));
  const pending = (await localAll("syncQueue")).filter(item => item.user_id === userId && item.table === storeName);
  const pendingIds = new Set(pending.map(item => item.record_id));
  for (const localRecord of await localRecordsFor(storeName, userId)) {
    if (!cloudIds.has(localRecord.id) && !pendingIds.has(localRecord.id)) await localDelete(storeName, localRecord.id);
  }
  for (const record of cloudRecords || []) {
    // Do not overwrite a local edit that is still waiting in the sync queue.
    if (!pendingIds.has(record.id)) await localPut(storeName, record);
  }
}

async function enqueueSync(userId, table, operation, id, payload) {
  await dbRequest("syncQueue", "readwrite", store => store.put({
    queueId: makeId(), user_id: userId, table, operation, record_id: id,
    payload: payload || null, created_at: new Date().toISOString()
  }));
  emitSyncStatus("pending", "Changes saved on this device; waiting to sync.");
}

async function flushSyncQueue() {
  if (!navigator.onLine || syncInProgress) return;
  syncInProgress = true;
  try {
    const user = await getCurrentUser();
    const items = (await localAll("syncQueue"))
      .filter(item => item.user_id === user.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const item of items) {
      if (item.table === "profile") {
        const { error } = await supabaseClient.auth.updateUser({ data: item.payload });
        if (error) throw error;
      } else if (item.operation === "delete") {
        const { error } = await supabaseClient.from(item.table).delete()
          .eq("id", item.record_id).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseClient.from(item.table)
          .upsert(item.payload, { onConflict: "id" }).select().single();
        if (error) throw error;
        if (data && MONETA_STORES.includes(item.table) && item.table !== "syncQueue") {
          await localPut(item.table, data);
        }
      }
      await localDelete("syncQueue", item.queueId);
    }
    const remaining = (await localAll("syncQueue")).filter(item => item.user_id === user.id).length;
    emitSyncStatus(remaining ? "pending" : "synced", remaining ? `${remaining} change(s) waiting to sync.` : "All changes synchronized.");
  } catch (error) {
    console.warn("MonetaTracker sync is waiting:", error);
    emitSyncStatus("pending", "Saved on this device. Sync will retry when the connection is available.");
  } finally {
    syncInProgress = false;
  }
}

window.addEventListener("online", () => { emitSyncStatus("syncing", "Connection restored. Synchronizing…"); flushSyncQueue(); });
window.addEventListener("offline", () => emitSyncStatus("offline", "Offline mode. Changes are saved on this device."));
window.addEventListener("load", () => { if (navigator.onLine) flushSyncQueue(); });

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
  await localPut(table, record);
  await enqueueSync(record.user_id, table, "upsert", record.id, record);
  await flushSyncQueue();
  return record;
}

async function addTransaction({ date, description, category, type, amount }) {
  const user = await getCurrentUser();
  return saveRecord("transactions", { id: makeId(), user_id: user.id, date, description: description.trim(), category, type, amount: Number(amount), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
}

async function updateTransaction(id, { date, description, category, type, amount }) {
  const user = await getCurrentUser();
  const existing = (await localRecordsFor("transactions", user.id)).find(item => item.id === id);
  if (!existing) throw new Error("Transaction not found on this device. Connect to the internet and try again.");
  return saveRecord("transactions", { ...existing, date, description: description.trim(), category, type, amount: Number(amount), updated_at: new Date().toISOString() });
}

async function deleteTransaction(id) {
  const user = await getCurrentUser();
  await localDelete("transactions", id);
  await enqueueSync(user.id, "transactions", "delete", id, null);
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

async function saveStickyNote({ id, title, content, pinned = false, color = "yellow" }) {
  const user = await getCurrentUser();
  const now = new Date().toISOString();
  const existing = id ? (await localRecordsFor("notes", user.id)).find(note => note.id === id) : null;
  const note = { ...(existing || {}), id: id || makeId(), user_id: user.id, title: title.trim(), content: content.trim(), pinned: Boolean(pinned), color, created_at: existing?.created_at || now, updated_at: now };
  return saveRecord("notes", note);
}

async function deleteStickyNote(id) {
  const user = await getCurrentUser();
  await localDelete("notes", id);
  await enqueueSync(user.id, "notes", "delete", id, null);
  await flushSyncQueue();
}

async function getPendingSyncCount() {
  const user = await getCurrentUser();
  return (await localAll("syncQueue")).filter(item => item.user_id === user.id).length;
}
