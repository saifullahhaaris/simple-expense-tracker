import type { Snapshot } from "./repo";
import { runningBalances, signedAmount } from "./ledger";

/* ------------------------------------------------------------------ CSV */

/**
 * Escapes one CSV cell. Text starting with = + - @ (or tab/CR) is prefixed with an apostrophe so
 * Excel/Sheets can't run it as a formula ("CSV injection"). Real numbers are written as-is.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "number") text = Number.isFinite(value) ? String(value) : "";
  else {
    text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map(r => r.map(csvCell).join(","))];
  // BOM so Excel opens UTF-8 correctly; CRLF line endings per RFC 4180.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const TX_HEADERS = ["Date", "Description", "Category", "Type", "Income", "Expense", "Running balance", "Project", "Created at", "ID"];

function transactionRows(snap: Snapshot): unknown[][] {
  const balances = runningBalances(snap.transactions);
  const projectNames = new Map(snap.projects.map(p => [p.id, p.name]));
  return snap.transactions.map(t => [
    t.date, t.description, t.category, t.type,
    t.type === "income" ? Number(t.amount) : "",
    t.type === "expense" ? Number(t.amount) : "",
    balances.get(t.id) ?? 0,
    t.project_id ? projectNames.get(t.project_id) ?? "" : "",
    t.created_at, t.id
  ]);
}

export function transactionsCsv(snap: Snapshot): string {
  return toCsv(TX_HEADERS, transactionRows(snap));
}

export function notesCsv(snap: Snapshot): string {
  const projectNames = new Map(snap.projects.map(p => [p.id, p.name]));
  return toCsv(
    ["Title", "Note", "Pinned", "Color", "Project", "Updated at", "ID"],
    snap.notes.map(n => [n.title, n.content, n.pinned ? "yes" : "no", n.color, n.project_id ? projectNames.get(n.project_id) ?? "" : "", n.updated_at, n.id])
  );
}

export function projectsCsv(snap: Snapshot): string {
  return toCsv(
    ["Name", "Description", "Status", "Budget", "Target date", "Income", "Expenses", "Balance", "ID"],
    snap.projects.map(p => {
      const own = snap.transactions.filter(t => t.project_id === p.id);
      const income = own.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expense = own.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      return [p.name, p.description, p.status, p.budget ?? "", p.target_date ?? "", income, expense, income - expense, p.id];
    })
  );
}

/* ------------------------------------------------------------------ JSON */

export const snapshotJson = (snap: Snapshot): string => JSON.stringify(snap, null, 2);

/* ------------------------------------------------------------------ Excel */

/** Multi-sheet .xlsx workbook. exceljs is loaded on demand so it never slows the main app. */
export async function buildWorkbook(snap: Snapshot): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "MonetaTracker";
  wb.created = new Date();

  const header = (sheet: import("exceljs").Worksheet) => {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  };
  const safe = (v: unknown) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

  // Summary
  const income = snap.transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = snap.transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ header: "Item", width: 28 }, { header: "Value", width: 28 }];
  summary.addRows([
    ["Account", snap.user.email ?? ""],
    ["Exported at", snap.exported_at],
    ["Transactions", snap.transactions.length],
    ["Total income", income],
    ["Total expenses", expense],
    ["Balance (all time)", snap.transactions.reduce((s, t) => s + signedAmount(t), 0)],
    ["Projects", snap.projects.length],
    ["Notes", snap.notes.length]
  ]);
  header(summary);

  const tx = wb.addWorksheet("Transactions");
  tx.columns = TX_HEADERS.map((h, i) => ({ header: h, width: [12, 36, 16, 10, 14, 14, 16, 20, 24, 38][i] }));
  tx.addRows(transactionRows(snap).map(r => r.map(safe)));
  for (const col of [5, 6, 7]) tx.getColumn(col).numFmt = "#,##0.00";
  header(tx);

  const proj = wb.addWorksheet("Projects");
  proj.columns = ["Name", "Description", "Status", "Budget", "Target date", "Income", "Expenses", "Balance"].map(h => ({ header: h, width: 18 }));
  for (const p of snap.projects) {
    const own = snap.transactions.filter(t => t.project_id === p.id);
    const inc = own.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
    const exp = own.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
    proj.addRow([safe(p.name), safe(p.description), p.status, p.budget ?? "", p.target_date ?? "", inc, exp, inc - exp]);
  }
  header(proj);

  const notes = wb.addWorksheet("Notes");
  notes.columns = [{ header: "Title", width: 24 }, { header: "Note", width: 60 }, { header: "Pinned", width: 10 }, { header: "Updated at", width: 24 }];
  for (const n of snap.notes) notes.addRow([safe(n.title), safe(n.content), n.pinned ? "yes" : "no", n.updated_at]);
  header(notes);

  const cats = wb.addWorksheet("Categories");
  cats.columns = [{ header: "Name", width: 24 }];
  for (const c of snap.categories) cats.addRow([safe(c.name)]);
  header(cats);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/* ------------------------------------------------------------------ download helper */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const textBlob = (text: string, type: string) => new Blob([text], { type: `${type};charset=utf-8` });

export function backupFilename(ext: string, label = "moneta"): string {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  return `${label}-${stamp}.${ext}`;
}

const LAST_BACKUP_KEY = "moneta-last-backup";
export const markBackupDone = () => { try { localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); } catch { /* ignore */ } };
export const lastBackupAt = (): string | null => { try { return localStorage.getItem(LAST_BACKUP_KEY); } catch { return null; } };
