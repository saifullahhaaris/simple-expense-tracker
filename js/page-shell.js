if (typeof applySavedTheme === "function") applySavedTheme();
const pageThemeToggle = document.getElementById("themeToggle");
const pageLogoutButton = document.getElementById("logoutButton");
const pageSyncStatus = document.getElementById("syncStatus");
if (pageThemeToggle) {
  pageThemeToggle.addEventListener("click", () => {
    toggleTheme();
    pageThemeToggle.textContent = document.documentElement.dataset.theme === "dark" ? "Light" : "Dark";
    window.dispatchEvent(new CustomEvent("moneta-theme-changed"));
  });
}
if (pageLogoutButton) {
  pageLogoutButton.addEventListener("click", async () => {
    if (!confirm("Log out of MonetaTracker? Pending offline changes on this device will remain stored, but will only sync when you sign in again.")) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) { alert(error.message); return; }
    window.location.href = "index.html";
  });
}
function setPageSyncStatus(detail) {
  if (!pageSyncStatus) return;
  const status = detail?.status || (navigator.onLine ? "synced" : "offline");
  pageSyncStatus.dataset.status = status;
  pageSyncStatus.textContent = detail?.message?.startsWith("Sync failed:") ? "Sync error · see details" : status === "synced" ? "Synced" : status === "syncing" ? "Syncing…" : status === "offline" ? "Offline · saved on device" : "Changes waiting to sync";
  pageSyncStatus.title = detail?.message || pageSyncStatus.textContent;
}
window.addEventListener("moneta-sync-status", event => setPageSyncStatus(event.detail));
setPageSyncStatus({ status: navigator.onLine ? "syncing" : "offline" });
