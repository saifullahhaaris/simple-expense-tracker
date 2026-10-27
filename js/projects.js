const projectForm = document.getElementById("projectForm");
const projectId = document.getElementById("projectId");
const projectName = document.getElementById("projectName");
const projectDescription = document.getElementById("projectDescription");
const projectBudget = document.getElementById("projectBudget");
const projectTargetDate = document.getElementById("projectTargetDate");
const projectFormHeading = document.getElementById("projectFormHeading");
const saveProjectButton = document.getElementById("saveProjectButton");
const cancelProjectEdit = document.getElementById("cancelProjectEdit");
const projectMessage = document.getElementById("projectMessage");
const projectsGrid = document.getElementById("projectsGrid");
const projectsEmpty = document.getElementById("projectsEmpty");
const showArchivedButton = document.getElementById("showArchived");
let showArchived = false;

function money(value) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "LKR", maximumFractionDigits: 2 }).format(Number(value || 0)); }
function resetProjectForm() { projectForm.reset(); projectId.value = ""; projectFormHeading.textContent = "Create a project"; saveProjectButton.textContent = "Create project"; cancelProjectEdit.hidden = true; projectMessage.textContent = ""; }
function editProject(project) { projectId.value = project.id; projectName.value = project.name || ""; projectDescription.value = project.description || ""; projectBudget.value = project.budget ?? ""; projectTargetDate.value = project.target_date || ""; projectFormHeading.textContent = "Edit project"; saveProjectButton.textContent = "Save changes"; cancelProjectEdit.hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); projectName.focus(); }
async function renderProjects() {
  const projects = await getProjects({ includeArchived: showArchived });
  const [transactions, notes] = await Promise.all([getTransactions(), getStickyNotes()]);
  projectsGrid.innerHTML = ""; projectsEmpty.hidden = projects.length > 0;
  for (const project of projects) {
    const own = transactions.filter(t => t.project_id === project.id); const income = own.filter(t => t.type === "income").reduce((s,t) => s + Number(t.amount),0); const expense = own.filter(t => t.type === "expense").reduce((s,t) => s + Number(t.amount),0); const noteCount = notes.filter(n => n.project_id === project.id).length;
    const card = document.createElement("article"); card.className = "project-card";
    const top = document.createElement("div"); top.className = "project-card-top"; const title = document.createElement("h3"); title.textContent = project.name; const status = document.createElement("span"); status.className = "project-status"; status.textContent = project.status || "active"; top.append(title,status);
    const desc = document.createElement("p"); desc.className = "project-description"; desc.textContent = project.description || "No description added.";
    const stats = document.createElement("div"); stats.className = "project-stats"; stats.innerHTML = `<div><span>Income</span><strong>${money(income)}</strong></div><div><span>Expenses</span><strong>${money(expense)}</strong></div><div><span>Notes</span><strong>${noteCount}</strong></div>`;
    const budget = document.createElement("p"); budget.className = "project-budget"; budget.textContent = project.budget == null ? "No budget set" : `Budget: ${money(project.budget)}${project.target_date ? ` · Target ${project.target_date}` : ""}`;
    const actions = document.createElement("div"); actions.className = "project-card-actions"; const open = document.createElement("a"); open.className = "primary inline-link"; open.href = `project.html?id=${encodeURIComponent(project.id)}`; open.textContent = "Open workspace"; const edit = document.createElement("button"); edit.className = "secondary"; edit.type = "button"; edit.textContent = "Edit"; edit.addEventListener("click", () => editProject(project)); const archive = document.createElement("button"); archive.className = "secondary"; archive.type = "button"; archive.textContent = project.status === "archived" ? "Restore" : "Archive"; archive.addEventListener("click", async () => { try { await saveProject({ ...project, status: project.status === "archived" ? "active" : "archived" }); await renderProjects(); } catch (e) { alert(e.message); } }); const remove = document.createElement("button"); remove.className = "secondary danger-outline"; remove.type = "button"; remove.textContent = "Delete"; remove.addEventListener("click", async () => { if (!confirm(`Delete project "${project.name}"? Its transactions and notes are kept but become unassigned.`)) return; try { if (projectId.value === project.id) resetProjectForm(); await deleteProject(project.id); await renderProjects(); } catch (e) { alert(e.message); } }); actions.append(open,edit,archive,remove); card.append(top,desc,stats,budget,actions); projectsGrid.appendChild(card);
  }
}
projectForm.addEventListener("submit", async event => { event.preventDefault(); saveProjectButton.disabled = true; projectMessage.textContent = "Saving project…"; try { await saveProject({ id: projectId.value || undefined, name: projectName.value, description: projectDescription.value, budget: projectBudget.value, target_date: projectTargetDate.value }); resetProjectForm(); projectMessage.textContent = navigator.onLine ? "Saved. Syncing to your account…" : "Saved on this device; it will sync when you’re online."; await renderProjects(); } catch (e) { projectMessage.textContent = e.message || "Could not save project."; } finally { saveProjectButton.disabled = false; } });
cancelProjectEdit.addEventListener("click", resetProjectForm);
showArchivedButton.addEventListener("click", async () => { showArchived = !showArchived; showArchivedButton.textContent = showArchived ? "Hide archived" : "Show archived"; await renderProjects(); });
window.addEventListener("moneta-sync-status", () => renderProjects().catch(console.error));
(async () => { try { await getCurrentUser(); applySavedTheme(); await renderProjects(); } catch (e) { console.error(e); alert(e.message || "Could not load projects."); } })();
