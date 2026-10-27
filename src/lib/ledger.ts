import type { Transaction } from "./types";
import type { Period } from "./dates";

export interface LedgerRow {
  tx: Transaction;
  /** Money position right after this transaction (opening balance carried in). */
  balance: number;
}

export interface Ledger {
  /** Chronological (oldest first) rows inside the period. */
  rows: LedgerRow[];
  /** Net position of everything BEFORE the period started (carried forward). */
  opening: number;
  income: number;
  expense: number;
  /** opening + income - expense */
  closing: number;
}

export const signedAmount = (tx: Pick<Transaction, "type" | "amount">): number =>
  tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);

/** Strict chronological order: date, then creation time, then id (so ties are stable). */
export function compareChronological(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ca = Date.parse(a.created_at) || 0;
  const cb = Date.parse(b.created_at) || 0;
  if (ca !== cb) return ca - cb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Builds the ledger for a period.
 *
 * Previously the running balance restarted from 0 at the start of every financial period
 * and ignored money carried over from earlier periods, so "Balance" was only that period's
 * net. Now the balance is a true running position: opening (everything before the period)
 * plus each transaction in order.
 */
export function buildLedger(all: Transaction[], period: Period): Ledger {
  const sorted = [...all].sort(compareChronological);
  let opening = 0;
  const inPeriod: Transaction[] = [];
  for (const tx of sorted) {
    if (tx.date < period.start) opening += signedAmount(tx);
    else if (tx.date <= period.end) inPeriod.push(tx);
  }

  let running = opening;
  let income = 0;
  let expense = 0;
  const rows: LedgerRow[] = inPeriod.map(tx => {
    running += signedAmount(tx);
    if (tx.type === "income") income += Number(tx.amount);
    else expense += Number(tx.amount);
    return { tx, balance: running };
  });

  return { rows, opening, income, expense, closing: opening + income - expense };
}

/** Simple totals (used for a project, where there is no "before" period). */
export function totals(transactions: Transaction[]) {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (tx.type === "income") income += Number(tx.amount);
    else expense += Number(tx.amount);
  }
  return { income, expense, balance: income - expense };
}

/** Running balance for every transaction across ALL time (used by exports). */
export function runningBalances(all: Transaction[]): Map<string, number> {
  const map = new Map<string, number>();
  let running = 0;
  for (const tx of [...all].sort(compareChronological)) {
    running += signedAmount(tx);
    map.set(tx.id, running);
  }
  return map;
}
