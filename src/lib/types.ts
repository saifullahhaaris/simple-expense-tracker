export type TxType = "income" | "expense";
export type NoteColor = "yellow" | "blue" | "pink" | "green";
export type ProjectStatus = "active" | "completed" | "archived";

/** Fields every synced row has. `_cloud` is local-only metadata (never sent to Supabase). */
export interface BaseRecord {
  id: string;
  user_id: string;
  created_at: string;
  updated_at?: string;
  _cloud?: string;
}

export interface Transaction extends BaseRecord {
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  type: TxType;
  amount: number;
  project_id: string | null;
  notes?: string | null;
}

export interface Category extends BaseRecord {
  name: string;
}

export interface Note extends BaseRecord {
  title: string;
  content: string;
  pinned: boolean;
  color: NoteColor;
  project_id: string | null;
  updated_at: string;
}

export interface Project extends BaseRecord {
  name: string;
  description: string;
  budget: number | null;
  target_date: string | null;
  status: ProjectStatus;
  updated_at: string;
}

export interface TableMap {
  transactions: Transaction;
  categories: Category;
  notes: Note;
  projects: Project;
}
export type TableName = keyof TableMap;
export const TABLES: TableName[] = ["projects", "categories", "notes", "transactions"];

export interface QueueItem {
  queueId: string;
  seq?: number;
  user_id: string;
  table: TableName | "profile";
  operation: "upsert" | "delete" | "update";
  record_id: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  last_error?: string;
  last_error_at?: string;
}

export type SyncState = "synced" | "syncing" | "pending" | "offline";
export interface SyncStatus {
  status: SyncState;
  message: string;
}
