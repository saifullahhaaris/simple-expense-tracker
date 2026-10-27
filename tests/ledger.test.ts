import test from "node:test";
import assert from "node:assert/strict";
import { buildLedger, runningBalances } from "../src/lib/ledger";
import { financialPeriodFor, shiftFinancialPeriod } from "../src/lib/dates";
import type { Transaction } from "../src/lib/types";

let n = 0;
let idc = 0;
const tx = (date: string, type: "income" | "expense", amount: number, created = `2026-01-01T00:00:0${n++ % 10}Z`): Transaction => ({
  id: `00000000-0000-0000-0000-${String(++idc).padStart(12, "0")}`, user_id: "u", date, description: "x", category: "Other",
  type, amount, project_id: null, created_at: created
});

test("balance carries over from earlier periods (the old bug restarted at 0)", () => {
  const all = [tx("2026-09-10", "income", 1000), tx("2026-09-20", "expense", 300), tx("2026-10-05", "expense", 100), tx("2026-10-06", "income", 50)];
  const l = buildLedger(all, { start: "2026-10-01", end: "2026-10-31" });
  assert.equal(l.opening, 700);
  assert.deepEqual(l.rows.map(r => r.balance), [600, 650]);
  assert.equal(l.income, 50);
  assert.equal(l.expense, 100);
  assert.equal(l.closing, 650);
});

test("order within a day follows creation time; input order is irrelevant", () => {
  const a = tx("2026-10-05", "income", 100, "2026-10-05T08:00:00Z");
  const b = tx("2026-10-05", "expense", 40, "2026-10-05T09:00:00Z");
  const l = buildLedger([b, a], { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(l.rows.map(r => r.balance), [100, 60]);
});

test("transactions after the period do not affect it", () => {
  const l = buildLedger([tx("2026-11-02", "expense", 999)], { start: "2026-10-01", end: "2026-10-31" });
  assert.equal(l.closing, 0);
  assert.equal(l.rows.length, 0);
});

test("period boundaries are inclusive", () => {
  const l = buildLedger([tx("2026-10-01", "income", 10), tx("2026-10-31", "income", 5)], { start: "2026-10-01", end: "2026-10-31" });
  assert.equal(l.rows.length, 2);
  assert.equal(l.closing, 15);
});

test("running balances across all time", () => {
  const a = tx("2026-01-01", "income", 100, "2026-01-01T00:00:00Z");
  const b = tx("2026-01-02", "expense", 30, "2026-01-02T00:00:00Z");
  const m = runningBalances([b, a]);
  assert.equal(m.get(a.id), 100);
  assert.equal(m.get(b.id), 70);
});

test("financial periods with a custom start day", () => {
  assert.deepEqual(financialPeriodFor("2026-10-26", 25), { start: "2026-10-25", end: "2026-11-24" });
  assert.deepEqual(financialPeriodFor("2026-10-10", 25), { start: "2026-09-25", end: "2026-10-24" });
  assert.equal(shiftFinancialPeriod("2026-10-25", 25, 1), "2026-11-25");
  assert.equal(shiftFinancialPeriod("2026-03-31", 31, -1), "2026-02-28");
});
