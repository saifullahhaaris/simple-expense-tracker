import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/Shell";
import { useNotes, useProjects, useRefreshData, useTransactions } from "../hooks/useData";
import { formatCurrency } from "../lib/format";
import { totals } from "../lib/ledger";
import { deleteProject, saveProject } from "../lib/repo";
import type { Project } from "../lib/types";

export default function Projects() {
  const [showArchived, setShowArchived] = useState(false);
  const projectsQuery = useProjects(showArchived);
  const transactions = useTransactions();
  const notes = useNotes();
  const refresh = useRefreshData();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const projects = projectsQuery.data ?? [];

  const reset = () => { setEditingId(null); setName(""); setDescription(""); setBudget(""); setTargetDate(""); setMessage(""); };

  const edit = (p: Project) => {
    setEditingId(p.id); setName(p.name || ""); setDescription(p.description || ""); setBudget(p.budget == null ? "" : String(p.budget));
    setTargetDate(p.target_date || ""); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("Saving project…");
    try {
      await saveProject({ id: editingId ?? undefined, name, description, budget, target_date: targetDate });
      reset();
      setMessage(navigator.onLine ? "Saved. Syncing to your account…" : "Saved on this device; it will sync when you’re online.");
      await refresh();
    } catch (e) {
      setMessage((e as Error).message || "Could not save project.");
    } finally { setSaving(false); }
  };

  const toggleArchive = async (p: Project) => {
    try { await saveProject({ ...p, status: p.status === "archived" ? "active" : "archived" }); await refresh(); }
    catch (e) { alert((e as Error).message); }
  };

  const remove = async (p: Project) => {
    if (!confirm(`Delete project "${p.name}"? Its transactions and notes are kept but become unassigned.`)) return;
    try {
      await deleteProject(p.id);
      if (editingId === p.id) reset();
      await refresh();
    } catch (e) { alert((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="My Projects" subtitle="Give each goal its own mini finance workspace." />

      <section className="panel">
        <div className="panel-header">
          <h2>{editingId ? "Edit project" : "Create a project"}</h2>
          <p>Examples: house construction, a trip, a small business, or a savings goal.</p>
        </div>
        <form className="project-form" onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="projectName">Project name</label>
            <input id="projectName" required maxLength={100} placeholder="Japan trip" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="projectDescription">Description</label>
            <input id="projectDescription" maxLength={500} placeholder="A 2-day trip to Tokyo" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="projectBudget">Budget (optional)</label>
            <input id="projectBudget" type="number" min="0" step="0.01" placeholder="0.00" value={budget} onChange={e => setBudget(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="projectTargetDate">Target date (optional)</label>
            <input id="projectTargetDate" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
          </div>
          <div className="project-form-actions">
            <button className="primary" type="submit" disabled={saving}>{editingId ? "Save changes" : "Create project"}</button>
            {editingId && <button className="secondary" type="button" onClick={reset}>Cancel edit</button>}
          </div>
          <p className="project-message" role="status">{message}</p>
        </form>
      </section>

      <section>
        <div className="project-section-heading">
          <div>
            <h2>Active projects</h2>
            <p className="subtitle">Open a project to view its own dashboard, transactions, chart and notes.</p>
          </div>
          <button type="button" className="secondary" onClick={() => setShowArchived(v => !v)}>{showArchived ? "Hide archived" : "Show archived"}</button>
        </div>

        <div className="projects-grid">
          {projects.map(p => {
            const own = (transactions.data ?? []).filter(t => t.project_id === p.id);
            const { income, expense } = totals(own);
            const noteCount = (notes.data ?? []).filter(n => n.project_id === p.id).length;
            return (
              <article className="project-card" key={p.id}>
                <div className="project-card-top">
                  <h3>{p.name}</h3>
                  <span className="project-status">{p.status || "active"}</span>
                </div>
                <p className="project-description">{p.description || "No description added."}</p>
                <div className="project-stats">
                  <div><span>Income</span><strong>{formatCurrency(income)}</strong></div>
                  <div><span>Expenses</span><strong>{formatCurrency(expense)}</strong></div>
                  <div><span>Notes</span><strong>{noteCount}</strong></div>
                </div>
                <p className="project-budget">
                  {p.budget == null ? "No budget set" : `Budget: ${formatCurrency(p.budget)}${p.target_date ? ` · Target ${p.target_date}` : ""}`}
                </p>
                <div className="project-card-actions">
                  <Link className="primary inline-link" to={`/projects/${encodeURIComponent(p.id)}`}>Open workspace</Link>
                  <button className="secondary" type="button" onClick={() => edit(p)}>Edit</button>
                  <button className="secondary" type="button" onClick={() => toggleArchive(p)}>{p.status === "archived" ? "Restore" : "Archive"}</button>
                  <button className="secondary danger-outline" type="button" onClick={() => remove(p)}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
        {!projectsQuery.isLoading && projects.length === 0 && <p className="empty">No projects yet. Create your first project above.</p>}
      </section>
    </>
  );
}
