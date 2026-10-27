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


// =========================
// Financial period helpers
// =========================

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthStartDate(year, monthIndex, preferredDay) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(preferredDay, lastDay));
}

function getFinancialPeriodForDate(dateString, startDay) {
  const date = parseLocalDate(dateString);
  let start = getMonthStartDate(date.getFullYear(), date.getMonth(), startDay);

  if (date < start) {
    start = getMonthStartDate(date.getFullYear(), date.getMonth() - 1, startDay);
  }

  const nextStart = getMonthStartDate(start.getFullYear(), start.getMonth() + 1, startDay);
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);

  return { start: toISODate(start), end: toISODate(end) };
}

function shiftFinancialPeriod(periodStart, startDay, direction) {
  const start = parseLocalDate(periodStart);
  const targetMonth = new Date(start.getFullYear(), start.getMonth() + direction, 1);
  return toISODate(getMonthStartDate(targetMonth.getFullYear(), targetMonth.getMonth(), startDay));
}

function formatDateRange(startDate, endDate) {
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}
