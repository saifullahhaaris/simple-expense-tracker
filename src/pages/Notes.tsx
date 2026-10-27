import { useState, type FormEvent } from "react";
import { PageHeader } from "../components/Shell";
import { useNotes, useRefreshData } from "../hooks/useData";
import { deleteNote, saveNote } from "../lib/repo";
import type { Note, NoteColor } from "../lib/types";

const COLORS: NoteColor[] = ["yellow", "blue", "pink", "green"];

export default function Notes() {
  const notesQuery = useNotes();
  const refresh = useRefreshData();
  const notes = notesQuery.data ?? [];

  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setEditing(null); setTitle(""); setContent(""); setPinned(false); setMessage(""); };

  const startEditing = (note: Note) => {
    setEditing(note); setTitle(note.title || ""); setContent(note.content || ""); setPinned(Boolean(note.pinned)); setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("Saving…");
    try {
      await saveNote({ id: editing?.id, title, content, pinned });
      reset();
      setMessage(navigator.onLine ? "Saved. Syncing to your account…" : "Saved on this device. It will sync when you're online.");
      await refresh();
    } catch (error) {
      setMessage((error as Error).message || "Could not save this note.");
    } finally { setSaving(false); }
  };

  const togglePin = async (note: Note) => {
    try { await saveNote({ ...note, pinned: !note.pinned }); await refresh(); } catch (e) { alert((e as Error).message); }
  };

  const remove = async (note: Note) => {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteNote(note.id);
      if (editing?.id === note.id) reset();
      await refresh();
    } catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="notes-app">
      <PageHeader title="Notes" subtitle="Simple reminders for bills, loans and things to remember." />

      <section className="panel note-editor-panel">
        <div className="panel-header">
          <div>
            <h2>{editing ? "Edit note" : "New note"}</h2>
            <p className="subtitle">Keep it simple. Add a due date in the note when you need one.</p>
          </div>
        </div>
        <form className="note-form" onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="noteTitle">Title (optional)</label>
            <input id="noteTitle" maxLength={120} placeholder="Vehicle Insurance" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="form-group note-field">
            <label htmlFor="noteContent">Note</label>
            <textarea id="noteContent" rows={5} maxLength={5000} placeholder="Pay 15,000 before 30th" required
              value={content} onChange={e => setContent(e.target.value)} />
          </div>
          <div className="note-editor-actions">
            <label className="pin-choice"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin note</label>
            <div>
              {editing && <button type="button" className="secondary" onClick={reset}>Cancel</button>}{" "}
              <button type="submit" className="primary" disabled={saving}>{editing ? "Update note" : "Save note"}</button>
            </div>
          </div>
          <p className="form-help" role="status">{message}</p>
        </form>
      </section>

      <section className="notes-list-section">
        <div className="panel-header">
          <div>
            <h2>Your notes</h2>
            <p className="subtitle">Notes are private to your account and sync across your devices.</p>
          </div>
        </div>
        <div className="notes-grid">
          {notes.map(note => (
            <article key={note.id} className={`sticky-note note-${COLORS.includes(note.color) ? note.color : "yellow"}${note.pinned ? " is-pinned" : ""}`}>
              <h3>{note.title || "Untitled note"}</h3>
              <p className="sticky-note-content">{note.content}</p>
              <p className="sticky-note-date">
                {note.pinned ? "Pinned · " : ""}Updated {new Date(note.updated_at || note.created_at).toLocaleDateString()}
              </p>
              <div className="sticky-note-actions">
                <button type="button" className="secondary" onClick={() => startEditing(note)}>Edit</button>
                <button type="button" className="secondary" onClick={() => togglePin(note)}>{note.pinned ? "Unpin" : "Pin"}</button>
                <button type="button" className="secondary danger-outline" onClick={() => remove(note)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
        {!notesQuery.isLoading && notes.length === 0 && <p className="empty">No notes yet. Create your first note above.</p>}
      </section>
    </div>
  );
}
