function formatCurrency(amount) {
  return `Rs. ${Number(amount).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatChartDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  });
}

function formatMonth(date) {
  return date.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applySavedTheme() {
  const theme = localStorage.getItem("expense-tracker-theme") || "light";

  document.documentElement.setAttribute("data-theme", theme);

  const button = document.getElementById("themeToggle");
  if (button) {
    button.textContent = theme === "dark" ? "Light" : "Dark";
  }
}

function toggleTheme() {
  const current = localStorage.getItem("expense-tracker-theme") || "light";
  const next = current === "dark" ? "light" : "dark";

  localStorage.setItem("expense-tracker-theme", next);
  document.documentElement.setAttribute("data-theme", next);

  const button = document.getElementById("themeToggle");
  if (button) {
    button.textContent = next === "dark" ? "Light" : "Dark";
  }

  return next;
}
