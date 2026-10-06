const dashboardButton = document.getElementById("dashboardButton");
const themeToggle = document.getElementById("themeToggle");
const logoutButton = document.getElementById("logoutButton");
const trendTitle = document.getElementById("trendTitle");
const chartEmpty = document.getElementById("chartEmpty");
const categoryChartTitle = document.getElementById("categoryChartTitle");
const categoryMonth = document.getElementById("categoryMonth");
const categoryEmpty = document.getElementById("categoryEmpty");

let trendChart = null;
let topExpensesChart = null;
let categoryChart = null;
let allTransactions = [];
let currentPeriod = "daily";

const periodButtons = document.querySelectorAll(".period-button");

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
  return allTransactions.filter(item => item.type === "expense");
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
  if (categoryChart) categoryChart.destroy();

  const selectedMonth = categoryMonth.value;
  const expenses = allTransactions.filter(transaction => {
    return transaction.type === "expense" && transaction.date.startsWith(selectedMonth);
  });

  if (expenses.length === 0) {
    categoryEmpty.hidden = false;
    categoryChartTitle.textContent = `Spending by Category`;
    return;
  }

  categoryEmpty.hidden = true;

  const grouped = new Map();
  for (const transaction of expenses) {
    const category = (transaction.category || "Other").trim() || "Other";
    grouped.set(category, (grouped.get(category) || 0) + Number(transaction.amount));
  }

  const categories = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  categoryChartTitle.textContent = `Spending by Category — ${formatMonth(new Date(`${selectedMonth}-01T00:00:00`))}`;

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

function populateCategoryMonths() {
  const months = [...new Set(
    allTransactions
      .filter(transaction => transaction.type === "expense")
      .map(transaction => transaction.date.slice(0, 7))
  )].sort().reverse();

  categoryMonth.innerHTML = "";

  if (months.length === 0) {
    const option = document.createElement("option");
    option.value = new Date().toISOString().slice(0, 7);
    option.textContent = "No expense data";
    categoryMonth.appendChild(option);
    return;
  }

  for (const month of months) {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = formatMonth(new Date(`${month}-01T00:00:00`));
    categoryMonth.appendChild(option);
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

categoryMonth.addEventListener("change", () => {
  renderCategoryChart();
});

periodButtons.forEach(button => {
  button.addEventListener("click", () => {
    currentPeriod = button.dataset.period;

    periodButtons.forEach(item => item.classList.remove("active"));
    button.classList.add("active");

    renderCharts();
  });
});

themeToggle.addEventListener("click", () => {
  toggleTheme();
  renderCharts();
});

dashboardButton.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});

logoutButton.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert(error.message);
    return;
  }

  window.location.href = "index.html";
});

async function startChartsPage() {
  try {
    await getCurrentUser();
    applySavedTheme();
    allTransactions = await getTransactions();
    populateCategoryMonths();
    renderCharts();
  } catch (error) {
    console.error(error);
    window.location.href = "index.html";
  }
}

startChartsPage();
