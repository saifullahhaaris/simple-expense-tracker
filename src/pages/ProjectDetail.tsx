import { useMemo, useRef, useState, type FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
import type { ChartConfiguration } from "chart.js";
import { PageHeader } from "../components/Shell";
import { cssVar, useChart } from "../hooks/useChart";
import { useNotes, useProjects, useRefreshData, useTransactions } from "../hooks/useData";
import { todayString } from "../lib/dates";
import { formatCurrency, formatDate } from "../lib/format";
import { compareChronological, totals } from "../lib/ledger";
import { addTransaction, deleteNote, deleteTransaction, saveNote } from "../lib/repo";
import type { TxType } from "../lib/types";

export default function ProjectDetail() {
  const { id = "" } = useParams();
  const projects = useProjects(true);
  const transactions = useTransactions();
  const notes = useNotes();
  const refresh = useRefreshData();

  const project = projects.data?.find(p => p.id === id);
  const own = useMemo(
    () => (transactions.data ?? []).filter(t => t.project_id === id).sort((a, b) => compareChronological(b, a)),
    [transactions.data, id]
  );
  const ownNotes = useMemo(
    () => (notes.data ?? []).filter(n => n.project_id === id).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
    [notes.data, id]
  );
  const { income, expense, balance } = totals(own);

  const [date, setDate] = useState(todayString());
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Other");
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [txMessage, setTxMessage] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteMessage, setNoteMessage] = useState("");

  const chartRef = useRef<HTMLCanvasElement>(null);
  useChart(chartRef, (): ChartConfiguration => ({
    type: "bar",
    data: { labels: ["Income", "Expenses"], datasets: [{ label: "Amount (Rs.)", data: [income, expense], backgroundColor: [cssVar("--income"), cssVar("--expense")], borderRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: cssVar("--text-secondary") }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: cssVar("--text-secondary") }, grid: { color: cssVar("--border") } } }
    }
  }), [income, expense]);

  // Wait for data before deciding the project does not exist (it may be loading or on another device).
  if (projects.isSuccess && !project) return <Navigate to="/projects" replace />;

  const addTx = async (event: FormEvent) => {
    event.preventDefault();
    setTxMessage("Saving…");
    try {
      await addTransaction({ date, description, category: category.trim() || "Other", type, amount: Number(amount), project_id: id });
      setDescription(""); setAmount(""); setCategory("Other"); setType("expense"); setDate(todayString());
      setTxMessage(navigator.onLine ? "Saved; synchronizing…" : "Saved locally; will sync when online.");
      await refresh();
    } catch (e) { setTxMessage((e as Error).message || "Could not save transaction."); }
  };

  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await saveNote({ title: noteTitle, content: noteContent, project_id: id });
      setNoteTitle(""); setNoteContent("");
      setNoteMessage(navigator.onLine ? "Saved; synchronizing…" : "Saved locally; will sync when online.");
      await refresh();
    } catch (e) { setNoteMessage((e as Error).message || "Could not save note."); }
  };

  return (
    <>
      <PageHeader
        title={project?.name ?? "Project workspace"}
        subtitle={project ? project.description || "Your project's own mini finance tracker." : "Loading…"}
        back={{ to: "/projects", label: "← My Projects" }}
      />

      <section className="summary project-summary">
        <div className="card"><p className="label">Income</p><p className="value">{formatCurrency(income)}</p></div>
        <div className="card"><p className="label">Expenses</p><p className="value">{formatCurrency(expense)}</p></div>
        <div className="card"><p className="label">Balance</p><p className="value">{formatCurrency(balance)}</p></div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Project transactions</h2>
          <p>These are the same transaction records used by MonetaTracker, linked to this project—not duplicate entries.</p>
        </div>
        <form className="project-form" onSubmit={addTx}>
          <div className="form-group"><label htmlFor="txDate">Date</label><input id="txDate" type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="txDescription">Description</label><input id="txDescription" required maxLength={200} placeholder="What was this for?" value={description} onChange={e => setDescription(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="txCategory">Category</label><input id="txCategory" maxLength={80} required value={category} onChange={e => setCategory(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="txType">Type</label>
            <select id="txType" value={type} onChange={e => setType(e.target.value as TxType)}><option value="expense">Expense</option><option value="income">Income</option></select>
          </div>
          <div className="form-group"><label htmlFor="txAmount">Amount (Rs.)</label><input id="txAmount" type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <button className="primary" type="submit">Add transaction</button>
          <p className="project-message" role="status">{txMessage}</p>
        </form>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th className="num">Amount</th><th>Action</th></tr></thead>
            <tbody>
              {own.map(t => (
                <tr key={t.id}>
                  <td>{formatDate(t.date)}</td><td>{t.description}</td><td>{t.category}</td><td>{t.type}</td><td className="num">{formatCurrency(t.amount)}</td>
                  <td>
                    <button type="button" className="delete" aria-label={`Delete ${t.description}`} onClick={async () => {
                      if (!confirm("Delete this transaction? This also removes it from the overall transaction history.")) return;
                      try { await deleteTransaction(t.id); await refresh(); } catch (e) { alert((e as Error).message); }
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {own.length === 0 && <p className="empty">No transactions in this project yet.</p>}
      </section>

      <section className="panel">
        <div className="panel-header"><h2>Project chart</h2><p>Income and expenses for this project only.</p></div>
        <div className="chart-container"><canvas ref={chartRef} aria-label="Project income and expenses chart" /></div>
      </section>

      <section className="panel">
        <div className="panel-header"><h2>Project notes</h2><p>Keep project reminders separate from your general sticky notes.</p></div>
        <form className="project-form" onSubmit={addNote}>
          <div className="form-group"><label htmlFor="projectNoteTitle">Title</label><input id="projectNoteTitle" maxLength={120} placeholder="Payment reminder" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="projectNoteContent">Note</label><input id="projectNoteContent" required maxLength={2000} placeholder="What do you need to remember?" value={noteContent} onChange={e => setNoteContent(e.target.value)} /></div>
          <button className="primary" type="submit">Save note</button>
          <p className="project-message" role="status">{noteMessage}</p>
        </form>
        <div className="project-notes-list">
          {ownNotes.map(n => (
            <article className="project-note-card" key={n.id}>
              <h3>{n.title || "Reminder"}</h3>
              <p>{n.content}</p>
              <button type="button" className="secondary danger-outline" onClick={async () => {
                if (!confirm("Delete this project note?")) return;
                try { await deleteNote(n.id); await refresh(); } catch (e) { alert((e as Error).message); }
              }}>Delete</button>
            </article>
          ))}
        </div>
        {ownNotes.length === 0 && <p className="empty">No notes for this project yet.</p>}
      </section>
    </>
  );
}
