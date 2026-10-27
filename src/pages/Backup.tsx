import { useRef, useState } from "react";
import { PageHeader } from "../components/Shell";
import { useRefreshData } from "../hooks/useData";
import {
  backupFilename, buildWorkbook, downloadBlob, lastBackupAt, markBackupDone, notesCsv, projectsCsv, snapshotJson, textBlob,
  transactionsCsv
} from "../lib/exporter";
import { formatDate } from "../lib/format";
import { toISODate } from "../lib/dates";
import { loadSnapshot, restoreSnapshot, type Snapshot } from "../lib/repo";

type Job = "csv" | "xlsx" | "json" | "restore";

export default function Backup() {
  const refresh = useRefreshData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Job | null>(null);
  const [message, setMessage] = useState("");
  const [last, setLast] = useState(lastBackupAt());

  const done = (text: string) => { markBackupDone(); setLast(lastBackupAt()); setMessage(text); };

  const run = async (job: Job, work: (snap: Snapshot) => Promise<string> | string) => {
    setBusy(job);
    setMessage("Preparing your data…");
    try {
      done(await work(await loadSnapshot()));
    } catch (error) {
      console.error(error);
      setMessage((error as Error).message || "Something went wrong.");
    } finally { setBusy(null); }
  };

  const exportCsv = () => run("csv", snap => {
    downloadBlob(textBlob(transactionsCsv(snap), "text/csv"), backupFilename("csv", "moneta-transactions"));
    if (snap.notes.length) downloadBlob(textBlob(notesCsv(snap), "text/csv"), backupFilename("csv", "moneta-notes"));
    if (snap.projects.length) downloadBlob(textBlob(projectsCsv(snap), "text/csv"), backupFilename("csv", "moneta-projects"));
    return `Exported ${snap.transactions.length} transactions as CSV.`;
  });

  const exportXlsx = () => run("xlsx", async snap => {
    downloadBlob(await buildWorkbook(snap), backupFilename("xlsx"));
    return `Excel workbook created with ${snap.transactions.length} transactions.`;
  });

  const exportJson = () => run("json", snap => {
    downloadBlob(textBlob(snapshotJson(snap), "application/json"), backupFilename("json", "moneta-backup"));
    return "Full backup downloaded. Keep it somewhere safe.";
  });

  const restore = async (file: File) => {
    setBusy("restore");
    setMessage("Reading backup…");
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("That file is too large to be a MonetaTracker backup.");
      const result = await restoreSnapshot(JSON.parse(await file.text()));
      await refresh();
      const a = result.added;
      setMessage(`Restored ${a.transactions} transactions, ${a.projects} projects, ${a.notes} notes, ${a.categories} categories. ${result.skipped} already existed or were skipped.`);
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "That file isn't valid JSON." : (error as Error).message || "Could not restore.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const disabled = busy !== null;

  return (
    <>
      <PageHeader title="Backup & export" subtitle="Download your data, or restore it from a backup file." />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Download your data</h2>
            <p>{last ? `Last backup from this device: ${formatDate(toISODate(new Date(last)))}.` : "You haven't downloaded a backup from this device yet."}</p>
          </div>
        </div>
        <div className="backup-grid">
          <article className="backup-card">
            <h3>Excel workbook</h3>
            <p>One .xlsx with Summary, Transactions (with running balance), Projects, Notes and Categories sheets.</p>
            <button type="button" className="primary" disabled={disabled} onClick={exportXlsx}>{busy === "xlsx" ? "Creating…" : "Download .xlsx"}</button>
          </article>
          <article className="backup-card">
            <h3>CSV files</h3>
            <p>Plain spreadsheets for transactions, notes and projects. Opens in Excel, Google Sheets and Numbers.</p>
            <button type="button" className="primary" disabled={disabled} onClick={exportCsv}>{busy === "csv" ? "Exporting…" : "Download .csv"}</button>
          </article>
          <article className="backup-card">
            <h3>Full backup (JSON)</h3>
            <p>Everything in one file. This is the one to keep, and the only format you can restore from.</p>
            <button type="button" className="primary" disabled={disabled} onClick={exportJson}>{busy === "json" ? "Preparing…" : "Download .json"}</button>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Restore from backup</h2>
            <p>Adds anything missing from a MonetaTracker JSON backup. Existing records are never changed or deleted.</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) void restore(f); }} />
        <button type="button" className="secondary" disabled={disabled} onClick={() => fileRef.current?.click()}>
          {busy === "restore" ? "Restoring…" : "Choose backup file…"}
        </button>
      </section>

      <p className="form-help backup-message" role="status" aria-live="polite">{message}</p>
    </>
  );
}
