const trendTitle = document.getElementById("trendTitle");
const chartEmpty = document.getElementById("chartEmpty");
const categoryChartTitle = document.getElementById("categoryChartTitle");
const categoryEmpty = document.getElementById("categoryEmpty");
const rangePreset = document.getElementById("rangePreset");
const rangeStart = document.getElementById("rangeStart");
const rangeEnd = document.getElementById("rangeEnd");
const applyRangeButton = document.getElementById("applyRangeButton");
const activeRangeLabel = document.getElementById("activeRangeLabel");

let trendChart = null;
let topExpensesChart = null;
let categoryChart = null;
let allTransactions = [];
let visibleTransactions = [];
let currentPeriod = "daily";
let financialStartDay = 1;
let activeRange = { start: null, end: null };


function destroyCharts() {
  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }

  if (topExpensesChart) {
    topExpensesChart.destroy();
    topExpensesChart = null;
  }
}

function getExpenseTransactions() {
  return visibleTransactions.filter(item => item.type === "expense");
}

function getDailyData(transactions) {
  const grouped = new Map();

  for (const transaction of transactions) {
    grouped.set(
      transaction.date,
      (grouped.get(transaction.date) || 0) + Number(transaction.amount)
    );
  }

  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function getWeekStart(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${dayOfMonth}`;
}

function getWeeklyData(transactions) {
  const grouped = new Map();

  for (const transaction of transactions) {
    const week = getWeekStart(transaction.date);
    grouped.set(week, (grouped.get(week) || 0) + Number(transaction.amount));
  }

  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function getMonthlyData(transactions) {
  const grouped = new Map();

  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    grouped.set(month, (grouped.get(month) || 0) + Number(transaction.amount));
  }

  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function getTrendData() {
  const expenses = getExpenseTransactions();
  const start = new Date(`${activeRange.start}T00:00:00`);
  const end = new Date(`${activeRange.end}T00:00:00`);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  currentPeriod = days <= 45 ? "daily" : days <= 150 ? "weekly" : "monthly";
  if (currentPeriod === "weekly") return getWeeklyData(expenses);
  if (currentPeriod === "monthly") return getMonthlyData(expenses);
  return getDailyData(expenses);
}

function getTrendLabels(data) {
  return data.map(([key]) => {
    if (currentPeriod === "daily") return formatChartDate(key);
    if (currentPeriod === "weekly") return `Week of ${formatChartDate(key)}`;

    const date = new Date(`${key}-01T00:00:00`);
    return formatMonth(date);
  });
}

function getCssVariable(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function renderCharts() {
  destroyCharts();

  const expenses = getExpenseTransactions();
  chartEmpty.hidden = expenses.length > 0;

  if (expenses.length === 0) {
    trendTitle.textContent = `${capitalize(currentPeriod)} Expenses`;
    renderCategoryChart();
    return;
  }

  const trendData = getTrendData();
  const labels = getTrendLabels(trendData);
  const values = trendData.map(([, value]) => value);

  const textColor = getCssVariable("--text");
  const secondaryColor = getCssVariable("--text-secondary");
  const borderColor = getCssVariable("--border");
  const expenseColor = getCssVariable("--expense");

  trendTitle.textContent = `${capitalize(currentPeriod)} Expenses`;

  trendChart = new Chart(document.getElementById("expenseTrendChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Expenses",
        data: values,
        backgroundColor: expenseColor,
        borderRadius: 6,
        maxBarThickness: 48
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` ${formatCurrency(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: secondaryColor },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: secondaryColor,
            callback: value => `Rs. ${Number(value).toLocaleString("en-LK")}`
          },
          grid: { color: borderColor }
        }
      }
    }
  });

  const groupedDescriptions = new Map();

  for (const transaction of expenses) {
    const description = transaction.description.trim() || "Other";
    groupedDescriptions.set(
      description,
      (groupedDescriptions.get(description) || 0) + Number(transaction.amount)
    );
  }

  const topExpenses = [...groupedDescriptions.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  topExpensesChart = new Chart(document.getElementById("topExpensesChart"), {
    type: "bar",
    data: {
      labels: topExpenses.map(([label]) => label),
      datasets: [{
        label: "Spent",
        data: topExpenses.map(([, value]) => value),
        backgroundColor: expenseColor,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => ` ${formatCurrency(context.parsed.x)}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: secondaryColor,
            callback: value => `Rs. ${Number(value).toLocaleString("en-LK")}`
          },
          grid: { color: borderColor }
        },
        y: {
          ticks: { color: textColor },
          grid: { display: false }
        }
      }
    }
  });

  renderCategoryChart();
}

function generateChartColors(count) {
  const colors = [];

  for (let i = 0; i < count; i++) {
    const hue = Math.round((360 / count) * i);
    colors.push(`hsl(${hue}, 70%, 55%)`);
  }

  return colors;
}

function renderCategoryChart() {
  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }

  const expenses = visibleTransactions.filter(transaction => transaction.type === "expense");

  if (expenses.length === 0) {
    categoryEmpty.hidden = false;
    categoryChartTitle.textContent = "Spending by Category";
    return;
  }

  categoryEmpty.hidden = true;

  const grouped = new Map();
  for (const transaction of expenses) {
    const category = (transaction.category || "Other").trim() || "Other";
    grouped.set(category, (grouped.get(category) || 0) + Number(transaction.amount));
  }

  const categories = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  categoryChartTitle.textContent = "Spending by Category";

  const textColor = getCssVariable("--text");
  const secondaryColor = getCssVariable("--text-secondary");

  categoryChart = new Chart(document.getElementById("categoryChart"), {
    type: "doughnut",
    data: {
      labels: categories.map(([label]) => label),
        datasets: [{
        data: categories.map(([, value]) => value),
        backgroundColor: generateChartColors(categories.length),
        borderWidth: 2,
        borderColor: getCssVariable("--surface")
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      plugins: {
        legend: {
          position: "right",
          labels: { color: textColor, padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: context => {
              const total = categories.reduce((sum, item) => sum + item[1], 0);
              const value = context.raw;
              const percentage = ((value / total) * 100).toFixed(1);
              return ` ${context.label}: ${formatCurrency(value)} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

function getTodayString() {
  return toISODate(new Date());
}

function getMonthBounds(dateString) {
  const date = parseLocalDate(dateString);
  return {
    start: toISODate(new Date(date.getFullYear(), date.getMonth(), 1)),
    end: toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0))
  };
}

function shiftDate(dateString, days) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function setActiveRange(start, end) {
  if (start > end) {
    alert("The start date must be on or before the end date.");
    return false;
  }

  activeRange = { start, end };
  rangeStart.value = start;
  rangeEnd.value = end;
  visibleTransactions = allTransactions.filter(transaction =>
    transaction.date >= start && transaction.date <= end
  );
  activeRangeLabel.textContent = `Showing ${formatDateRange(start, end)}`;
  renderCharts();
  return true;
}

function applyPresetRange() {
  const today = getTodayString();
  const preset = rangePreset.value;
  let start;
  let end = today;

  if (preset === "financial") {
    ({ start, end } = getFinancialPeriodForDate(today, financialStartDay));
  } else if (preset === "previous") {
    const current = getFinancialPeriodForDate(today, financialStartDay);
    const previousStart = shiftFinancialPeriod(current.start, financialStartDay, -1);
    ({ start, end } = getFinancialPeriodForDate(previousStart, financialStartDay));
  } else if (preset === "7" || preset === "30") {
    start = shiftDate(today, -(Number(preset) - 1));
  } else if (preset === "calendar") {
    ({ start } = getMonthBounds(today));
  } else if (preset === "all") {
    const dates = allTransactions.map(transaction => transaction.date).sort();
    start = dates[0] || today;
    end = dates[dates.length - 1] || today;
  } else if (preset === "custom") {
    rangeStart.disabled = false;
    rangeEnd.disabled = false;
    return;
  }

  rangeStart.disabled = preset !== "custom";
  rangeEnd.disabled = preset !== "custom";
  setActiveRange(start, end);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

rangePreset.addEventListener("change", applyPresetRange);

applyRangeButton.addEventListener("click", () => {
  if (rangePreset.value !== "custom") {
    applyPresetRange();
    return;
  }

  if (!rangeStart.value || !rangeEnd.value) {
    alert("Choose both a start date and an end date.");
    return;
  }

  setActiveRange(rangeStart.value, rangeEnd.value);
});





async function startChartsPage() {
  try {
    const user = await getCurrentUser();
    applySavedTheme();
    const day = Number(user.user_metadata?.financial_start_day || 1);
    financialStartDay = Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
    allTransactions = await getTransactions();
    applyPresetRange();
  } catch (error) {
    console.error(error);
    window.location.href = "index.html";
  }
}

startChartsPage();


const syncStatusElement = document.getElementById("syncStatus");
function updateSyncStatus(detail) {
  if (!syncStatusElement) return;
  const status = detail?.status || (navigator.onLine ? "synced" : "offline");
  syncStatusElement.dataset.status = status;
  syncStatusElement.textContent = status === "synced" ? "Synced" : status === "syncing" ? "Syncing…" : status === "offline" ? "Offline · saved on device" : "Changes waiting to sync";
  syncStatusElement.title = detail?.message || syncStatusElement.textContent;
}
window.addEventListener("moneta-sync-status", event => updateSyncStatus(event.detail));
updateSyncStatus({ status: navigator.onLine ? "syncing" : "offline" });

window.addEventListener("moneta-theme-changed", renderCharts);
