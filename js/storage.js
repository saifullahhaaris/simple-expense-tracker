const STORAGE_KEY = "expense-tracker-transactions";

function getTransactions() {
  const savedData = localStorage.getItem(STORAGE_KEY);

  if (!savedData) {
    return [];
  }

  try {
    return JSON.parse(savedData);
  } catch (error) {
    console.error("Could not read saved transactions:", error);
    return [];
  }
}

function saveTransactions(transactions) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(transactions)
  );
}