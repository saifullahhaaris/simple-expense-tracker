const params = new URLSearchParams(location.search);
const currentProjectId = params.get("id");
const workspaceTitle = document.getElementById("workspaceTitle");
const workspaceDescription = document.getElementById("workspaceDescription");
const transactionForm = document.getElementById("projectTransactionForm");
const txDate = document.getElementById("txDate");
const txDescription = document.getElementById("txDescription");
const txCategory = document.getElementById("txCategory");
const txType = document.getElementById("txType");
const txAmount = document.getElementById("txAmount");
const txMessage = document.getElementById("txMessage");
const transactionsBody = document.getElementById("projectTransactionsBody");
const transactionsEmpty = document.getElementById("projectTransactionsEmpty");
const noteForm = document.getElementById("projectNoteForm");
const projectNotesList = document.getElementById("projectNotesList");
const projectNotesEmpty = document.getElementById("projectNotesEmpty");
let projectChart;
function projectMoney(v) { return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 2 }).format(Number(v || 0)); }
function safeCell(text) { const el = document.createElement("td"); el.textContent = text == null ? "" : String(text); return el; }
async function renderWorkspace() {
  const project = await getProject(currentProjectId); if (!project) { alert("This project could not be found on this device. Connect to the internet and reopen My Projects if it was created on another device."); location.href = "projects.html"; return; }
  workspaceTitle.textContent = project.name; workspaceDescription.textContent = project.description || "Your project's own mini finance tracker.";
  const all = await getTransactions(); const transactions = all.filter(t => t.project_id === project.id).sort((a,b) => String(b.date).localeCompare(String(a.date)));
  const income = transactions.filter(t => t.type === "income").reduce((s,t) => s + Number(t.amount),0); const expenses = transactions.filter(t => t.type === "expense").reduce((s,t) => s + Number(t.amount),0);
  document.getElementById("projectIncome").textContent = projectMoney(income); document.getElementById("projectExpenses").textContent = projectMoney(expenses); document.getElementById("projectBalance").textContent = projectMoney(income-expenses);
  transactionsBody.innerHTML = ""; transactionsEmpty.hidden = transactions.length > 0;
  for (const tx of transactions) { const tr = document.createElement("tr"); tr.append(safeCell(tx.date),safeCell(tx.description),safeCell(tx.category),safeCell(tx.type),safeCell(projectMoney(tx.amount))); const action = document.createElement("td"); const del = document.createElement("button"); del.type = "button"; del.className = "delete"; del.textContent = "Delete"; del.setAttribute("aria-label", `Delete ${tx.description}`); del.addEventListener("click", async () => { if (!confirm("Delete this transaction? This also removes it from the overall transaction history.")) return; try { await deleteTransaction(tx.id); await renderWorkspace(); } catch(e) { alert(e.message); } }); action.appendChild(del); tr.appendChild(action); transactionsBody.appendChild(tr); }
  if (projectChart) projectChart.destroy(); const ctx = document.getElementById("projectChart"); projectChart = new Chart(ctx,{type:"bar",data:{labels:["Income","Expenses"],datasets:[{label:"Amount (LKR)",data:[income,expenses]}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
  const notes = (await getStickyNotes()).filter(n => n.project_id === project.id).sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at))); projectNotesList.innerHTML = ""; projectNotesEmpty.hidden = notes.length > 0;
  for (const note of notes) { const article = document.createElement("article"); article.className = "project-note-card"; const h = document.createElement("h3"); h.textContent = note.title || "Reminder"; const p = document.createElement("p"); p.textContent = note.content; const del = document.createElement("button"); del.type = "button"; del.className = "secondary danger-outline"; del.textContent = "Delete"; del.addEventListener("click", async () => { if (!confirm("Delete this project note?")) return; await deleteStickyNote(note.id); await renderWorkspace(); }); article.append(h,p,del); projectNotesList.appendChild(article); }
}
txDate.value = new Date().toISOString().slice(0,10);
transactionForm.addEventListener("submit", async e => { e.preventDefault(); const button = document.getElementById("txSave"); button.disabled = true; txMessage.textContent = "Saving…"; try { await addTransaction({ date: txDate.value, description: txDescription.value, category: txCategory.value, type: txType.value, amount: txAmount.value, project_id: currentProjectId }); transactionForm.reset(); txDate.value = new Date().toISOString().slice(0,10); txCategory.value = "Other"; txType.value = "expense"; txMessage.textContent = navigator.onLine ? "Saved; synchronizing…" : "Saved locally; will sync when online."; await renderWorkspace(); } catch(e) { txMessage.textContent = e.message || "Could not save transaction."; } finally { button.disabled = false; } });
noteForm.addEventListener("submit", async e => { e.preventDefault(); const title = document.getElementById("projectNoteTitle"); const content = document.getElementById("projectNoteContent"); const message = document.getElementById("projectNoteMessage"); try { await saveStickyNote({ title: title.value, content: content.value, project_id: currentProjectId }); noteForm.reset(); message.textContent = navigator.onLine ? "Saved; synchronizing…" : "Saved locally; will sync when online."; await renderWorkspace(); } catch(e) { message.textContent = e.message || "Could not save note."; } });
window.addEventListener("moneta-sync-status", () => renderWorkspace().catch(console.error));
(async () => { try { await getCurrentUser(); applySavedTheme(); await renderWorkspace(); } catch(e) { console.error(e); alert(e.message || "Could not open project."); } })();
