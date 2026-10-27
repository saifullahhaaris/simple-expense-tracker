import { useMemo, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "../components/Shell";
import { useCategories, useFinancialStartDay, useRefreshData, useTransactions } from "../hooks/useData";
import { financialPeriodFor, ordinal, shiftFinancialPeriod, todayString } from "../lib/dates";
import { formatCurrency, formatDate, formatDateRange } from "../lib/format";
import { buildLedger } from "../lib/ledger";
import { addCategory, addTransaction, deleteTransaction, saveFinancialStartDay, updateTransaction } from "../lib/repo";
import type { Transaction, TxType } from "../lib/types";

const DEFAULT_CATEGORIES = ["Food", "Transport", "Bills", "Shopping", "Entertainment", "Health", "Education", "Other"];
const CUSTOM = "__custom__";

interface FormState {
  date: string;
  description: string;
  category: string;
  type: TxType;
  amount: string;
}
const emptyForm = (): FormState => ({ date: todayString(), description: "", category: "", type: "expense", amount: "" });

export default function Dashboard() {
  const transactions = useTransactions();
  const categories = useCategories();
  const startDayQuery = useFinancialStartDay();
  const refresh = useRefreshData();

  const startDay = startDayQuery.data ?? 1;
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [pendingStartDay, setPendingStartDay] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLElement>(null);

  const period = useMemo(() => financialPeriodFor(selectedStart ?? todayString(), startDay), [selectedStart, startDay]);
  const ledger = useMemo(() => buildLedger(transactions.data ?? [], period), [transactions.data, period]);
  const rowsNewestFirst = useMemo(() => [...ledger.rows].reverse(), [ledger.rows]);

  const categoryOptions = useMemo(() => {
    const seen = new Set(DEFAULT_CATEGORIES.map(c => c.toLowerCase()));
    const extra: string[] = [];
    for (const c of categories.data ?? []) if (!seen.has(c.name.toLowerCase())) { seen.add(c.name.toLowerCase()); extra.push(c.name); }
    // keep an edited transaction's own category selectable even if it is not in the list
    if (form.category && form.category !== CUSTOM && !seen.has(form.category.toLowerCase())) extra.push(form.category);
    return [...DEFAULT_CATEGORIES, ...extra];
  }, [categories.data, form.category]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(f => ({ ...f, [key]: value }));

  const reset = () => { setForm(emptyForm()); setEditingId(null); setCustomName(""); };

  const startEditing = (t: Transaction) => {
    setEditingId(t.id);
    setForm({ date: t.date, description: t.description, category: t.category || "Other", type: t.type, amount: String(t.amount) });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const createCategory = async () => {
    const name = customName.trim();
    if (!name) { alert("Please enter a category name."); return; }
    setBusy(true);
    try {
      const created = await addCategory(name);
      await refresh();
      set("category", created.name);
      setCustomName("");
    } catch (error) {
      alert((error as Error).message || "Could not create category.");
    } finally { setBusy(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    const description = form.description.trim();
    if (!form.date || !description || !form.category || form.category === CUSTOM || !Number.isFinite(amount) || amount <= 0) {
      alert("Please complete all fields.");
      return;
    }
    setBusy(true);
    try {
      const input = { date: form.date, description, category: form.category, type: form.type, amount };
      if (editingId) await updateTransaction(editingId, input);
      else await addTransaction(input);
      reset();
      await refresh();
    } catch (error) {
      console.error(error);
      alert((error as Error).message || "Could not save transaction.");
    } finally { setBusy(false); }
  };

  const remove = async (t: Transaction) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      await deleteTransaction(t.id);
      if (editingId === t.id) reset();
      await refresh();
    } catch (error) {
      alert((error as Error).message || "Could not delete transaction.");
    }
  };

  const saveStartDay = async () => {
    const next = pendingStartDay ?? startDay;
    try {
      await saveFinancialStartDay(next);
      setSelectedStart(null);
      await refresh();
      alert("Financial month settings saved.");
    } catch (error) {
      setPendingStartDay(null);
      alert((error as Error).message || "Could not save financial month settings.");
    }
  };

  return (
    <>
      <PageHeader title="Expense Tracker" subtitle="Just record money in and money out." />

      <section className="panel financial-period-panel">
        <div className="financial-period-toolbar">
          <div className="period-navigation">
            <button type="button" className="secondary" aria-label="Previous financial period"
              onClick={() => setSelectedStart(shiftFinancialPeriod(period.start, startDay, -1))}>Previous</button>
            <div className="period-current">
              <h2>Financial period</h2>
              <p className="subtitle">{formatDateRange(period.start, period.end)}</p>
            </div>
            <button type="button" className="secondary" aria-label="Next financial period"
              onClick={() => setSelectedStart(shiftFinancialPeriod(period.start, startDay, 1))}>Next</button>
          </div>
          <details className="financial-settings">
            <summary>Financial month settings</summary>
            <div className="financial-settings-content">
              <label htmlFor="financialStartDay">My financial month starts on</label>
              <div className="financial-setting-row">
                <select id="financialStartDay" value={pendingStartDay ?? startDay} onChange={e => setPendingStartDay(Number(e.target.value))}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{ordinal(d)} of each month</option>)}
                </select>
                <button type="button" className="secondary" onClick={saveStartDay}>Save</button>
              </div>
              <p className="form-help">For example, choosing 25 shows the 25th through the 24th of the next month.</p>
            </div>
          </details>
        </div>
      </section>

      <section className="summary">
        <div className="card">
          <div className="label">Income</div>
          <div className="value">{formatCurrency(ledger.income)}</div>
        </div>
        <div className="card">
          <div className="label">Expenses</div>
          <div className="value">{formatCurrency(ledger.expense)}</div>
        </div>
        <div className="card">
          <div className="label">Balance</div>
          <div className="value">{formatCurrency(ledger.closing)}</div>
          <div className="card-note">Brought forward {formatCurrency(ledger.opening)}</div>
        </div>
      </section>

      <section className="panel" ref={formRef}>
        <div className="panel-header">
          <div>
            <h2>{editingId ? "Update Transaction" : "Add Transaction"}</h2>
            <p>{editingId ? "Correct the details of this transaction." : "Record your income or expense."}</p>
          </div>
        </div>

        <form className="form" onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" required value={form.date} onChange={e => set("date", e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="description">Description</label>
            <input id="description" type="text" placeholder="e.g. Groceries" maxLength={120} required
              value={form.description} onChange={e => set("description", e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="category">Category</label>
            <select id="category" required value={form.category} onChange={e => set("category", e.target.value)}>
              <option value="">Select category</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              <option value={CUSTOM}>+ Create new category</option>
            </select>
            {form.category === CUSTOM && (
              <div className="new-category-box">
                <input type="text" placeholder="Enter your category" maxLength={60} autoFocus required
                  value={customName} onChange={e => setCustomName(e.target.value)} />
                <button type="button" className="secondary" disabled={busy} onClick={createCategory}>Create</button>
              </div>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="type">Type</label>
            <select id="type" required value={form.type} onChange={e => set("type", e.target.value as TxType)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="amount">Amount</label>
            <input id="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" required
              value={form.amount} onChange={e => set("amount", e.target.value)} />
          </div>
          <div className="add-field">
            <button className="primary" type="submit" disabled={busy}>{editingId ? "Update Transaction" : "Add Transaction"}</button>
            {editingId && <button className="secondary" type="button" onClick={reset}>Cancel</button>}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Transactions</h2>
            <p>Transactions from {formatDate(period.start)} to {formatDate(period.end)}.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Description</th><th>Category</th><th>Income</th><th>Expense</th><th>Balance</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rowsNewestFirst.map(({ tx, balance }) => (
                <tr key={tx.id}>
                  <td>{formatDate(tx.date)}</td>
                  <td><div>{tx.description}</div></td>
                  <td>{tx.category || "Other"}</td>
                  <td className="num income-cell">{tx.type === "income" ? formatCurrency(tx.amount) : "—"}</td>
                  <td className="num expense-cell">{tx.type === "expense" ? formatCurrency(tx.amount) : "—"}</td>
                  <td className="num">{formatCurrency(balance)}</td>
                  <td className="actions-cell">
                    <button className="edit" type="button" onClick={() => startEditing(tx)}>Edit</button>
                    <button className="delete" type="button" onClick={() => remove(tx)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {transactions.isLoading ? (
            <div className="empty">Loading…</div>
          ) : rowsNewestFirst.length === 0 && (
            <div className="empty" id="empty">
              No transactions yet.<br />Add your first transaction above.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
