import type { QueueItem, TableMap, TableName } from "./types";

// IMPORTANT: name and version match the previous version of the app on purpose.
// Any offline changes still waiting in a browser's queue are picked up and synced.
export const DB_NAME = "monetatracker-local-v1";
export const DB_VERSION = 2;
export type StoreName = TableName | "syncQueue";

let dbPromise: Promise<IDBDatabase> | undefined;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ["transactions", "categories", "notes", "projects"]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("syncQueue")) db.createObjectStore("syncQueue", { keyPath: "queueId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = undefined;
      reject(request.error ?? new Error("Could not open local storage."));
    };
  });
  return dbPromise;
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = op(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const localPut = <T extends object>(store: StoreName, record: T) => run(store, "readwrite", s => s.put(record));
export const localDelete = (store: StoreName, id: string) => run(store, "readwrite", s => s.delete(id));
export const localGet = <S extends TableName>(store: S, id: string) =>
  run<TableMap[S] | undefined>(store, "readonly", s => s.get(id));
export const localAll = <S extends TableName>(store: S) => run<TableMap[S][]>(store, "readonly", s => s.getAll());
export const queueAll = () => run<QueueItem[]>("syncQueue", "readonly", s => s.getAll());
export const queuePut = (item: QueueItem) => localPut("syncQueue", item);
export const queueDelete = (queueId: string) => localDelete("syncQueue", queueId);

/** Run several store operations atomically in one IndexedDB transaction. */
export async function transact(stores: StoreName[], work: (tx: IDBTransaction) => void): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");
    work(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Local storage write failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Local storage write was cancelled."));
  });
}
