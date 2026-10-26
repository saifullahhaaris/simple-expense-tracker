// =========================
// Get elements
// =========================

const entryForm = document.getElementById("entryForm");
const dateInput = document.getElementById("date");
const descriptionInput = document.getElementById("description");
const typeInput = document.getElementById("type");
const amountInput = document.getElementById("amount");
const ledger = document.getElementById("ledger");
const emptyState = document.getElementById("empty");
const totalIncome = document.getElementById("totalIncome");
const totalExpense = document.getElementById("totalExpense");
const balance = document.getElementById("balance");

const logoutButton = document.getElementById("logoutButton");
const themeToggle = document.getElementById("themeToggle");

const submitButton = document.getElementById("submitButton");
const cancelButton = document.getElementById("cancelButton");

const formTitle = document.getElementById("formTitle");
const formSubtitle = document.getElementById("formSubtitle");

const categorySelect = document.getElementById("category");
const newCategoryBox =
  document.getElementById("newCategoryBox");
const customCategoryInput =
  document.getElementById("customCategory");

const createCategoryButton =
  document.getElementById("createCategoryButton");
const previousPeriodButton = document.getElementById("previousPeriodButton");
const nextPeriodButton = document.getElementById("nextPeriodButton");
const financialPeriodTitle = document.getElementById("financialPeriodTitle");
const financialPeriodDates = document.getElementById("financialPeriodDates");
const transactionPeriodSubtitle = document.getElementById("transactionPeriodSubtitle");
const financialStartDaySelect = document.getElementById("financialStartDay");
const saveFinancialSettingsButton = document.getElementById("saveFinancialSettingsButton");

let editingTransactionId = null;
let transactionsCache = [];
let financialStartDay = 1;
let selectedPeriodStart = null;


// =========================
// Helpers
// =========================

function getToday() {
  const date = new Date();
  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}


function resetForm() {
  editingTransactionId = null;

  entryForm.reset();

  dateInput.value = getToday();

  categorySelect.value = "";
    
  customCategoryInput.value = "";
  newCategoryBox.hidden = true;
  customCategoryInput.required = false;

  submitButton.textContent = "Add Transaction";

  cancelButton.hidden = true;

  formTitle.textContent = "Add Transaction";

  formSubtitle.textContent =
    "Record your income or expense.";
}


function startEditing(transaction) {
  editingTransactionId = transaction.id;

  dateInput.value = transaction.date;
  descriptionInput.value = transaction.description;

  categorySelect.value =
    transaction.category || "Other";

  typeInput.value = transaction.type;
  amountInput.value = transaction.amount;

  submitButton.textContent = "Update Transaction";

  cancelButton.hidden = false;

  formTitle.textContent = "Update Transaction";

  formSubtitle.textContent =
    "Correct the details of this transaction.";

  descriptionInput.focus();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// =========================
// Financial period controls
// =========================

function getCurrentFinancialPeriod() {
  return getFinancialPeriodForDate(getToday(), financialStartDay);
}

function getSelectedFinancialPeriod() {
  return getFinancialPeriodForDate(selectedPeriodStart || getToday(), financialStartDay);
}

function renderSelectedPeriod() {
  const period = getSelectedFinancialPeriod();
  selectedPeriodStart = period.start;

  financialPeriodTitle.textContent = "Financial period";
  financialPeriodDates.textContent = formatDateRange(period.start, period.end);
  transactionPeriodSubtitle.textContent = `Transactions from ${formatDate(period.start)} to ${formatDate(period.end)}.`;

  const periodTransactions = transactionsCache.filter(transaction =>
    transaction.date >= period.start && transaction.date <= period.end
  );

  renderTransactions(periodTransactions);
}

function populateFinancialStartDays() {
  financialStartDaySelect.innerHTML = "";

  for (let day = 1; day <= 31; day++) {
    const option = document.createElement("option");
    option.value = String(day);
    option.textContent = `${day}${day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"} of each month`;
    financialStartDaySelect.appendChild(option);
  }

  financialStartDaySelect.value = String(financialStartDay);
}

previousPeriodButton.addEventListener("click", () => {
  selectedPeriodStart = shiftFinancialPeriod(getSelectedFinancialPeriod().start, financialStartDay, -1);
  renderSelectedPeriod();
});

nextPeriodButton.addEventListener("click", () => {
  selectedPeriodStart = shiftFinancialPeriod(getSelectedFinancialPeriod().start, financialStartDay, 1);
  renderSelectedPeriod();
});

saveFinancialSettingsButton.addEventListener("click", async () => {
  const previousDay = financialStartDay;
  const nextDay = Number(financialStartDaySelect.value);
  saveFinancialSettingsButton.disabled = true;

  try {
    await saveFinancialStartDay(nextDay);
    financialStartDay = nextDay;
    selectedPeriodStart = getCurrentFinancialPeriod().start;
    renderSelectedPeriod();
    alert("Financial month settings saved.");
  } catch (error) {
    console.error("Could not save financial month settings:", error);
    financialStartDaySelect.value = String(previousDay);
    alert(error.message || "Could not save financial month settings.");
  } finally {
    saveFinancialSettingsButton.disabled = false;
  }
});


// =========================
// Render transactions
// =========================

function renderTransactions(transactions) {
  ledger.innerHTML = "";

  let income = 0;
  let expense = 0;

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);

    if (transaction.type === "income") {
      income += amount;
    } else {
      expense += amount;
    }
  }

  totalIncome.textContent =
    formatCurrency(income);

  totalExpense.textContent =
    formatCurrency(expense);

  balance.textContent =
    formatCurrency(income - expense);


  if (transactions.length === 0) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;


  // Newest transactions first
  const displayTransactions =
    [...transactions].sort((a, b) => {

      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }

      return (
        new Date(b.created_at) -
        new Date(a.created_at)
      );
    });


  // Calculate chronological balance
  let runningBalance = 0;

  const balanceMap = new Map();

  for (const transaction of transactions) {

    const amount =
      Number(transaction.amount);

    if (transaction.type === "income") {
      runningBalance += amount;
    } else {
      runningBalance -= amount;
    }

    balanceMap.set(
      transaction.id,
      runningBalance
    );
  }


  // Render rows
  for (const transaction of displayTransactions) {

    const amount =
      Number(transaction.amount);

    const row =
      document.createElement("tr");

    row.innerHTML = `
      <td>
        ${escapeHtml(
          formatDate(transaction.date)
        )}
      </td>

      <td>
        <div>${escapeHtml(transaction.description)}</div>
              </td>

      <td>
        ${escapeHtml(
          transaction.category || "Other"
        )}
      </td>

      <td class="num income-cell">
        ${
          transaction.type === "income"
            ? escapeHtml(
                formatCurrency(amount)
              )
            : "—"
        }
      </td>

      <td class="num expense-cell">
        ${
          transaction.type === "expense"
            ? escapeHtml(
                formatCurrency(amount)
              )
            : "—"
        }
      </td>

      <td class="num">
        ${escapeHtml(
          formatCurrency(
            balanceMap.get(transaction.id) || 0
          )
        )}
      </td>

      <td class="actions-cell">

        <button
          class="edit"
          data-id="${transaction.id}"
          type="button"
        >
          Edit
        </button>

        <button
          class="delete"
          data-id="${transaction.id}"
          type="button"
        >
          Delete
        </button>

      </td>
    `;

    ledger.appendChild(row);
  }
}


// =========================
// Load transactions
// =========================

async function loadTransactions() {

  try {

    transactionsCache =
      await getTransactions();

    if (!selectedPeriodStart) {
      selectedPeriodStart = getCurrentFinancialPeriod().start;
    }

    renderSelectedPeriod();

  } catch (error) {

    console.error(
      "Could not load transactions:",
      error
    );

    alert(
      error.message ||
      "Could not load transactions."
    );
  }
}


// =========================
// Load categories
// =========================

async function loadCategories() {

  try {

    const categories =
      await getCategories();


    const createOption =
      categorySelect.querySelector(
        'option[value="__custom__"]'
      );


    // Remove previously loaded
    // user-created categories

    categorySelect
      .querySelectorAll(".user-category")
      .forEach(option => option.remove());


    // Add categories from Supabase

    for (const category of categories) {

      // Don't duplicate hard-coded categories

      const existingOption =
        [...categorySelect.options]
          .find(
            option =>
              option.value.toLowerCase() ===
              category.name.toLowerCase()
          );

      if (existingOption) {
        continue;
      }


      const option =
        document.createElement("option");

      option.value = category.name;

      option.textContent =
        category.name;

      option.classList.add(
        "user-category"
      );


      categorySelect.insertBefore(
        option,
        createOption
      );
    }

  } catch (error) {

    console.error(
      "Could not load categories:",
      error
    );
  }
}


// =========================
// Category selector
// =========================

categorySelect.addEventListener(
  "change",
  () => {

    if (categorySelect.value === "__custom__") {

      newCategoryBox.hidden = false;

      customCategoryInput.required = true;

      customCategoryInput.focus();

    } else {

      newCategoryBox.hidden = true;

      customCategoryInput.required = false;

      customCategoryInput.value = "";
    }
  }
);


// =========================
// Create new category
// =========================

createCategoryButton.addEventListener(
  "click",
  async () => {

    const name =
      customCategoryInput.value.trim();


    if (!name) {

      alert(
        "Please enter a category name."
      );

      customCategoryInput.focus();

      return;
    }


    createCategoryButton.disabled =
      true;


    try {

      const category =
        await addCategory(name);


      // Create dropdown option

      const option =
        document.createElement("option");

      option.value =
        category.name;

      option.textContent =
        category.name;

      option.classList.add(
        "user-category"
      );


      const createOption =
        categorySelect.querySelector(
          'option[value="__custom__"]'
        );


      categorySelect.insertBefore(
        option,
        createOption
      );


      // Select the new category

      categorySelect.value =
        category.name;


      // Hide custom input

     customCategoryInput.value = "";

     newCategoryBox.hidden = true;

     customCategoryInput.required = false;

    } catch (error) {

      console.error(
        "Could not create category:",
        error
      );

      alert(
        error.message ||
        "Could not create category."
      );

    } finally {

      createCategoryButton.disabled =
        false;
    }
  }
);


// =========================
// Add / Update transaction
// =========================

entryForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    const date =
      dateInput.value;

    const description =
      descriptionInput.value.trim();

    const category =
      categorySelect.value;

    const type =
      typeInput.value;

    const amount =
      Number(amountInput.value);


    // Validate

    if (
      !date ||
      !description ||
      !category ||
      category === "__custom__" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      alert(
        "Please complete all fields."
      );

      return;
    }


    submitButton.disabled =
      true;


    try {

      if (editingTransactionId) {

        await updateTransaction(
          editingTransactionId,
          {
            date,
            description,
            category,
            type,
            amount
          }
        );

      } else {

        await addTransaction({
          date,
          description,
          category,
          type,
          amount
        });
      }


      resetForm();

      await loadTransactions();

    } catch (error) {

      console.error(
        "Could not save transaction:",
        error
      );

      alert(
        error.message ||
        "Could not save transaction."
      );

    } finally {

      submitButton.disabled =
        false;
    }
  }
);


// =========================
// Cancel editing
// =========================

cancelButton.addEventListener(
  "click",
  resetForm
);


// =========================
// Edit / Delete
// =========================

ledger.addEventListener(
  "click",
  async (event) => {

    const editButton =
      event.target.closest(".edit");

    const deleteButton =
      event.target.closest(".delete");


    // Edit

    if (editButton) {

      const transaction =
        transactionsCache.find(
          item =>
            item.id ===
            editButton.dataset.id
        );


      if (transaction) {
        startEditing(transaction);
      }

      return;
    }


    // Delete

    if (!deleteButton) {
      return;
    }


    const confirmed =
      confirm(
        "Delete this transaction?"
      );


    if (!confirmed) {
      return;
    }


    try {

      await deleteTransaction(
        deleteButton.dataset.id
      );


      if (
        editingTransactionId ===
        deleteButton.dataset.id
      ) {

        resetForm();
      }


      await loadTransactions();

    } catch (error) {

      console.error(
        "Could not delete transaction:",
        error
      );

      alert(
        error.message ||
        "Could not delete transaction."
      );
    }
  }
);


// =========================
// Theme
// =========================

themeToggle.addEventListener(
  "click",
  () => {
    toggleTheme();
  }
);



// =========================
// Logout
// =========================

logoutButton.addEventListener(
  "click",
  async () => {

    try {
      const pendingCount = await getPendingSyncCount();
      if (pendingCount > 0 && !confirm(`${pendingCount} change(s) are waiting to sync. They will remain on this device and sync after you sign in again. Log out anyway?`)) return;
    } catch (error) {
      console.warn("Could not check pending sync changes:", error);
    }

    const { error } =
      await supabaseClient.auth.signOut();


    if (error) {

      alert(error.message);

      return;
    }


    window.location.href =
      "index.html";
  }
);


// =========================
// Protect dashboard
// =========================

async function startDashboard() {

  try {

    const user =
      await getCurrentUser();


    if (!user) {
      throw new Error(
        "You are not logged in."
      );
    }


    applySavedTheme();

    financialStartDay = await getFinancialStartDay();
    populateFinancialStartDays();
    selectedPeriodStart = getCurrentFinancialPeriod().start;

    resetForm();

    await loadCategories();

    await loadTransactions();

  } catch (error) {

    console.error(error);

    window.location.href =
      "index.html";
  }
}


startDashboard();

// Offline / synchronization status
const syncStatusElement = document.getElementById("syncStatus");
function updateSyncStatus(detail) {
  if (!syncStatusElement) return;
  const status = detail?.status || (navigator.onLine ? "synced" : "offline");
  syncStatusElement.dataset.status = status;
  syncStatusElement.textContent = detail?.message?.startsWith("Sync failed:") ? "Sync error · see details" : status === "synced" ? "Synced" : status === "syncing" ? "Syncing…" : status === "offline" ? "Offline · saved on device" : "Changes waiting to sync";
  syncStatusElement.title = detail?.message || syncStatusElement.textContent;
}
window.addEventListener("moneta-sync-status", event => updateSyncStatus(event.detail));
// Pull in changes from other devices once a sync pass finishes.
let syncRefreshTimer;
window.addEventListener("moneta-sync-status", event => {
  if (event.detail?.status !== "synced") return;
  clearTimeout(syncRefreshTimer);
  syncRefreshTimer = setTimeout(() => { loadTransactions(); loadCategories(); }, 300);
});
updateSyncStatus({ status: navigator.onLine ? "syncing" : "offline" });
