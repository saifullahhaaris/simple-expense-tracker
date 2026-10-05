// =========================
// Get elements
// =========================

const entryForm =
  document.getElementById("entryForm");

const dateInput =
  document.getElementById("date");

const descriptionInput =
  document.getElementById("description");

const typeInput =
  document.getElementById("type");

const amountInput =
  document.getElementById("amount");

const ledger =
  document.getElementById("ledger");

const emptyState =
  document.getElementById("empty");

const totalIncome =
  document.getElementById("totalIncome");

const totalExpense =
  document.getElementById("totalExpense");

const balance =
  document.getElementById("balance");

const logoutButton =
  document.getElementById("logoutButton");


// =========================
// Today's date
// =========================

function getToday() {

  const date = new Date();

  const offset =
    date.getTimezoneOffset();

  return new Date(
    date.getTime() -
    offset * 60000
  )
    .toISOString()
    .slice(0, 10);
}


dateInput.value = getToday();


// =========================
// Render transactions
// =========================

function renderTransactions(transactions) {

  ledger.innerHTML = "";

  let income = 0;
  let expense = 0;
  let runningBalance = 0;


  if (transactions.length === 0) {

    emptyState.style.display = "block";

    totalIncome.textContent =
      formatCurrency(0);

    totalExpense.textContent =
      formatCurrency(0);

    balance.textContent =
      formatCurrency(0);

    return;
  }


  emptyState.style.display = "none";


  for (const transaction of transactions) {

    const amount =
      Number(transaction.amount);


    if (transaction.type === "income") {

      income += amount;
      runningBalance += amount;

    } else {

      expense += amount;
      runningBalance -= amount;

    }


    const row =
      document.createElement("tr");


    row.innerHTML = `

      <td>
        ${formatDate(transaction.date)}
      </td>

      <td>
        ${transaction.description}
      </td>

      <td class="num">
        ${
          transaction.type === "income"
            ? formatCurrency(amount)
            : ""
        }
      </td>

      <td class="num">
        ${
          transaction.type === "expense"
            ? formatCurrency(amount)
            : ""
        }
      </td>

      <td class="num">
        ${formatCurrency(runningBalance)}
      </td>

      <td class="num">

        <button
          class="delete"
          data-id="${transaction.id}"
          title="Delete transaction"
        >
          ×
        </button>

      </td>

    `;


    ledger.appendChild(row);

  }


  totalIncome.textContent =
    formatCurrency(income);

  totalExpense.textContent =
    formatCurrency(expense);

  balance.textContent =
    formatCurrency(
      income - expense
    );

}


// =========================
// Load transactions
// =========================

async function loadTransactions() {

  try {

    const transactions =
      await getTransactions();

    renderTransactions(
      transactions
    );

  } catch (error) {

    console.error(
      "Could not load transactions:",
      error
    );

  }

}


// =========================
// Add transaction
// =========================

entryForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    const date =
      dateInput.value;

    const description =
      descriptionInput.value.trim();

    const type =
      typeInput.value;

    const amount =
      Number(amountInput.value);


    if (
      !date ||
      !description ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      return;

    }


    try {

      await addTransaction({

        date,
        description,
        type,
        amount

      });


      entryForm.reset();

      dateInput.value =
        getToday();

      descriptionInput.focus();


      await loadTransactions();


    } catch (error) {

      console.error(
        "Could not add transaction:",
        error
      );

      alert(
        error.message ||
        "Could not add transaction."
      );

    }

  }
);


// =========================
// Delete transaction
// =========================

ledger.addEventListener(
  "click",
  async (event) => {

    const button =
      event.target.closest(".delete");


    if (!button) {
      return;
    }


    const id =
      button.dataset.id;


    const confirmed =
      confirm(
        "Delete this transaction?"
      );


    if (!confirmed) {
      return;
    }


    try {

      await deleteTransaction(id);

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
// Logout
// =========================

logoutButton.addEventListener(
  "click",
  async () => {

    const {
      error
    } =
      await supabaseClient.auth.signOut();


    if (error) {

      console.error(
        "Logout error:",
        error
      );

      alert(
        error.message
      );

      return;

    }


    window.location.href =
      "index.html";

  }
);


// =========================
// Start dashboard
// =========================

loadTransactions();