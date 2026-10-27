import { supabase } from "./supabase";
import {
  deleteProjectAndEnqueue, deleteRecordAndEnqueue, enqueueProfile, flushSyncQueue, getCurrentUser,
  hasPendingProfile, localRecordsFor, makeId, pullTable, saveRecordAndEnqueue
} from "./sync";
import { compareChronological } from "./ledger";
import type { Category, Note, NoteColor, Project, ProjectStatus, TableName, Transaction, TxType } from "./types";

// Reads come from the local copy; the cloud is pulled at most every few seconds per table so a
// local write re-renders instantly instead of waiting on the network.
const PULL_EVERY_MS = 8000;
const lastPull = new Map<string, number>();
/** Make the next read of every table pull from the cloud (called after each sync pass). */
export function forceNextPull(): void { lastPull.clear(); }

/** Pull one table from the cloud when online; fall back silently to the local copy. */
async function refresh(table: TableName, userId: string): Promise<void> {
  if (!navigator.onLine) return;
  const key = `${userId}:${table}`;
  if (Date.now() - (lastPull.get(key) ?? 0) < PULL_EVERY_MS) return;
  try {
    await pullTable(table, userId);
    lastPull.set(key, Date.now());
  } catch (error) {
    console.warn(`Using locally cached ${table}:`, error);
  }
}

async function save<T extends Transaction | Category | Note | Project>(
  table: TableName, record: T
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await saveRecordAndEnqueue(table as any, record as any);
  void flushSyncQueue();
  return record;
}

/* ------------------------------------------------------------------ transactions */

export async function getTransactions(): Promise<Transaction[]> {
  const user = await getCurrentUser();
  await refresh("transactions", user.id);
  return (await localRecordsFor("transactions", user.id)).sort(compareChronological);
}

export interface TransactionInput {
  date: string;
  description: string;
  category: string;
  type: TxType;
  amount: number;
  project_id?: string | null;
}

export async function addTransaction(input: TransactionInput): Promise<Transaction> {
  const user = await getCurrentUser();
  const now = new Date().toISOString();
  return save("transactions", {
    id: makeId(), user_id: user.id, date: input.date, description: input.description.trim(),
    category: input.category, type: input.type, amount: Number(input.amount),
    project_id: input.project_id || null, created_at: now, updated_at: now
  });
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<Transaction> {
  const user = await getCurrentUser();
  const existing = (await localRecordsFor("transactions", user.id)).find(t => t.id === id);
  if (!existing) throw new Error("Transaction not found on this device. Connect to the internet and try again.");
  return save("transactions", {
    ...existing, date: input.date, description: input.description.trim(), category: input.category,
    type: input.type, amount: Number(input.amount), updated_at: new Date().toISOString()
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  const user = await getCurrentUser();
  await deleteRecordAndEnqueue("transactions", user.id, id);
  void flushSyncQueue();
}

/* ------------------------------------------------------------------ categories */

export async function getCategories(): Promise<Category[]> {
  const user = await getCurrentUser();
  await refresh("categories", user.id);
  return (await localRecordsFor("categories", user.id)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function addCategory(name: string): Promise<Category> {
  const user = await getCurrentUser();
  const clean = name.trim();
  if (!clean) throw new Error("Enter a category name.");
  const existing = await localRecordsFor("categories", user.id);
  if (existing.some(c => c.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) throw new Error("That category already exists.");
  return save("categories", { id: makeId(), user_id: user.id, name: clean, created_at: new Date().toISOString() });
}

/* ------------------------------------------------------------------ notes */

export async function getNotes(): Promise<Note[]> {
  const user = await getCurrentUser();
  await refresh("notes", user.id);
  return (await localRecordsFor("notes", user.id)).sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || String(b.updated_at).localeCompare(String(a.updated_at))
  );
}

export interface NoteInput {
  id?: string;
  title: string;
  content: string;
  pinned?: boolean;
  color?: NoteColor;
  project_id?: string | null;
}

export async function saveNote(input: NoteInput): Promise<Note> {
  const user = await getCurrentUser();
  const now = new Date().toISOString();
  const existing = input.id ? (await localRecordsFor("notes", user.id)).find(n => n.id === input.id) : undefined;
  return save("notes", {
    ...(existing ?? {}),
    id: input.id ?? makeId(), user_id: user.id, title: input.title.trim(), content: input.content.trim(),
    pinned: Boolean(input.pinned), color: input.color ?? existing?.color ?? "yellow",
    project_id: input.project_id ?? existing?.project_id ?? null,
    created_at: existing?.created_at ?? now, updated_at: now
  });
}

export async function deleteNote(id: string): Promise<void> {
  const user = await getCurrentUser();
  await deleteRecordAndEnqueue("notes", user.id, id);
  void flushSyncQueue();
}

/* ------------------------------------------------------------------ projects */

export async function getProjects(includeArchived = false): Promise<Project[]> {
  const user = await getCurrentUser();
  await refresh("projects", user.id);
  return (await localRecordsFor("projects", user.id))
    .filter(p => includeArchived || p.status !== "archived")
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
}

export interface ProjectInput {
  id?: string;
  name: string;
  description?: string;
  budget?: string | number | null;
  target_date?: string | null;
  status?: ProjectStatus;
}

export async function saveProject(input: ProjectInput): Promise<Project> {
  const user = await getCurrentUser();
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Enter a project name.");
  const existing = input.id ? (await localRecordsFor("projects", user.id)).find(p => p.id === input.id) : undefined;
  const budget = input.budget === "" || input.budget == null ? null : Number(input.budget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) throw new Error("Budget must be a valid non-negative amount.");
  const now = new Date().toISOString();
  return save("projects", {
    ...(existing ?? {}),
    id: input.id ?? makeId(), user_id: user.id, name, description: String(input.description ?? "").trim(),
    budget, target_date: input.target_date || null, status: input.status ?? existing?.status ?? "active",
    created_at: existing?.created_at ?? now, updated_at: now
  });
}

export async function deleteProject(id: string): Promise<void> {
  const user = await getCurrentUser();
  await deleteProjectAndEnqueue(user.id, id);
  void flushSyncQueue();
}

/* ------------------------------------------------------------------ profile (financial month) */

const startKey = (userId: string) => `moneta-financial-start-${userId}`;
const validDay = (d: number) => Number.isInteger(d) && d >= 1 && d <= 31;

export async function getFinancialStartDay(): Promise<number> {
  const user = await getCurrentUser();
  if (navigator.onLine && !(await hasPendingProfile(user.id))) {
    try {
      const { data: { user: fresh } } = await supabase.auth.getUser();
      const remote = Number(fresh?.user_metadata?.financial_start_day);
      if (validDay(remote)) localStorage.setItem(startKey(user.id), String(remote));
    } catch (error) {
      console.warn("Could not refresh financial start day:", error);
    }
  }
  const day = Number(localStorage.getItem(startKey(user.id)) || user.user_metadata?.financial_start_day || 1);
  return validDay(day) ? day : 1;
}

export async function saveFinancialStartDay(day: number): Promise<number> {
  if (!validDay(day)) throw new Error("Choose a day between 1 and 31.");
  const user = await getCurrentUser();
  localStorage.setItem(startKey(user.id), String(day));
  await enqueueProfile(user.id, { financial_start_day: day });
  void flushSyncQueue();
  return day;
}

/* ------------------------------------------------------------------ everything (for backup) */

export interface Snapshot {
  app: "MonetaTracker";
  format: 1;
  exported_at: string;
  user: { id: string; email: string | null };
  financial_start_day: number;
  projects: Project[];
  categories: Category[];
  notes: Note[];
  transactions: Transaction[];
}

/** Fresh copy of ALL of the signed-in user's data (pulls from the cloud first when online). */
export async function loadSnapshot(): Promise<Snapshot> {
  const user = await getCurrentUser();
  forceNextPull();
  await Promise.all((["projects", "categories", "notes", "transactions"] as const).map(t => refresh(t, user.id)));
  const strip = <T extends object>(r: T): T => {
    const copy = { ...r } as Record<string, unknown>;
    delete copy._cloud;
    return copy as T;
  };
  return {
    app: "MonetaTracker", format: 1, exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email ?? null },
    financial_start_day: await getFinancialStartDay(),
    projects: (await localRecordsFor("projects", user.id)).map(strip),
    categories: (await localRecordsFor("categories", user.id)).map(strip),
    notes: (await localRecordsFor("notes", user.id)).map(strip),
    transactions: (await localRecordsFor("transactions", user.id)).sort(compareChronological).map(strip)
  };
}

export interface RestoreResult {
  added: Record<"projects" | "categories" | "notes" | "transactions", number>;
  skipped: number;
}

/**
 * Restore from a JSON backup. Non-destructive: records whose id already exists are left alone,
 * everything else is added under the current account and synced like a normal edit.
 */
export async function restoreSnapshot(raw: unknown): Promise<RestoreResult> {
  const snap = raw as Partial<Snapshot> | null;
  if (!snap || snap.app !== "MonetaTracker" || !Array.isArray(snap.transactions)) {
    throw new Error("This file is not a MonetaTracker backup.");
  }
  const user = await getCurrentUser();
  const result: RestoreResult = { added: { projects: 0, categories: 0, notes: 0, transactions: 0 }, skipped: 0 };
  const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

  for (const table of ["projects", "categories", "notes", "transactions"] as const) {
    const existingIds = new Set((await localRecordsFor(table, user.id)).map(r => r.id));
    const rows = (snap[table] ?? []) as unknown as Array<Record<string, unknown>>;
    for (const row of rows) {
      if (!isId(row.id) || existingIds.has(row.id)) { result.skipped++; continue; }
      if (table === "transactions") {
        const amount = Number(row.amount);
        if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
            (row.type !== "income" && row.type !== "expense") || !Number.isFinite(amount) || amount < 0) {
          result.skipped++; continue;
        }
      }
      const now = new Date().toISOString();
      const record = { ...row, user_id: user.id, created_at: (row.created_at as string) || now } as never;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await saveRecordAndEnqueue(table, record as any);
      result.added[table]++;
    }
  }
  void flushSyncQueue();
  return result;
}
