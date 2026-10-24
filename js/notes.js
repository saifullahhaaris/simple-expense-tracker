const noteForm = document.getElementById("noteForm");
const noteIdInput = document.getElementById("noteId");
const noteTitleInput = document.getElementById("noteTitle");
const noteContentInput = document.getElementById("noteContent");
const notePinnedInput = document.getElementById("notePinned");
const noteFormTitle = document.getElementById("noteFormTitle");
const saveNoteButton = document.getElementById("saveNoteButton");
const cancelNoteButton = document.getElementById("cancelNoteButton");
const noteMessage = document.getElementById("noteMessage");
const notesGrid = document.getElementById("notesGrid");
const notesEmpty = document.getElementById("notesEmpty");
let notesCache = [];

function resetNoteForm() {
  noteForm.reset(); noteIdInput.value = ""; noteFormTitle.textContent = "New note";
  saveNoteButton.textContent = "Save note"; cancelNoteButton.hidden = true; noteMessage.textContent = "";
}
function renderNotes() {
  notesGrid.innerHTML = "";
  notesEmpty.hidden = notesCache.length > 0;
  for (const note of notesCache) {
    const card = document.createElement("article");
    card.className = `sticky-note note-${["yellow","blue","pink","green"].includes(note.color) ? note.color : "yellow"}${note.pinned ? " is-pinned" : ""}`;
    const title = document.createElement("h3"); title.textContent = note.title || "Untitled note";
    const content = document.createElement("p"); content.className = "sticky-note-content"; content.textContent = note.content;
    const meta = document.createElement("p"); meta.className = "sticky-note-date"; meta.textContent = `${note.pinned ? "Pinned · " : ""}Updated ${new Date(note.updated_at || note.created_at).toLocaleDateString()}`;
    const actions = document.createElement("div"); actions.className = "sticky-note-actions";
    const edit = document.createElement("button"); edit.className = "secondary"; edit.type = "button"; edit.textContent = "Edit"; edit.addEventListener("click", () => startNoteEditing(note));
    const pin = document.createElement("button"); pin.className = "secondary"; pin.type = "button"; pin.textContent = note.pinned ? "Unpin" : "Pin"; pin.addEventListener("click", async () => { try { await saveStickyNote({ ...note, pinned: !note.pinned }); await loadNotes(); } catch (e) { alert(e.message); } });
    const remove = document.createElement("button"); remove.className = "secondary danger-outline"; remove.type = "button"; remove.textContent = "Delete"; remove.addEventListener("click", async () => { if (!confirm("Delete this note?")) return; try { await deleteStickyNote(note.id); await loadNotes(); } catch (e) { alert(e.message); } });
    actions.append(edit, pin, remove); card.append(title, content, meta, actions); notesGrid.appendChild(card);
  }
}
function startNoteEditing(note) {
  noteIdInput.value = note.id; noteTitleInput.value = note.title || ""; noteContentInput.value = note.content || ""; notePinnedInput.checked = Boolean(note.pinned);
  noteFormTitle.textContent = "Edit note"; saveNoteButton.textContent = "Update note"; cancelNoteButton.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" }); noteContentInput.focus();
}
async function loadNotes() {
  notesCache = await getStickyNotes(); renderNotes();
}
noteForm.addEventListener("submit", async event => {
  event.preventDefault(); saveNoteButton.disabled = true; noteMessage.textContent = "Saving…";
  try {
    await saveStickyNote({ id: noteIdInput.value || undefined, title: noteTitleInput.value, content: noteContentInput.value, pinned: notePinnedInput.checked });
    resetNoteForm(); noteMessage.textContent = navigator.onLine ? "Saved. Syncing to your account…" : "Saved on this device. It will sync when you're online.";
    await loadNotes();
  } catch (error) { noteMessage.textContent = error.message || "Could not save this note."; }
  finally { saveNoteButton.disabled = false; }
});
cancelNoteButton.addEventListener("click", resetNoteForm);
(async function startNotes() {
  try { await getCurrentUser(); applySavedTheme(); await loadNotes(); }
  catch (error) { console.error(error); alert(error.message || "Could not open notes."); }
})();
const syncStatusElement = document.getElementById("syncStatus");
function updateSyncStatus(detail) { const status = detail?.status || (navigator.onLine ? "synced" : "offline"); syncStatusElement.dataset.status = status; syncStatusElement.textContent = status === "synced" ? "Synced" : status === "syncing" ? "Syncing…" : status === "offline" ? "Offline · saved on device" : "Changes waiting to sync"; syncStatusElement.title = detail?.message || syncStatusElement.textContent; }
window.addEventListener("moneta-sync-status", event => updateSyncStatus(event.detail)); updateSyncStatus({ status: navigator.onLine ? "syncing" : "offline" });
