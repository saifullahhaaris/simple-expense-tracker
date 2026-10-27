import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv, transactionsCsv } from "../src/lib/exporter";
import type { Snapshot } from "../src/lib/repo";

test("csvCell quotes and neutralises formulas", () => {
  assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell(-5), "-5"); // real numbers stay numbers
  assert.equal(csvCell(null), "");
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
});

test("toCsv has BOM, CRLF and header", () => {
  const out = toCsv(["a", "b"], [[1, "x"]]);
  assert.ok(out.startsWith("﻿a,b\r\n1,x\r\n"));
});

test("transactions csv includes running balance", () => {
  const snap = {
    app: "MonetaTracker", format: 1, exported_at: "now", user: { id: "u", email: "e" }, financial_start_day: 1,
    projects: [], categories: [], notes: [],
    transactions: [
      { id: "a", user_id: "u", date: "2026-01-01", description: "Pay", category: "Other", type: "income", amount: 100, project_id: null, created_at: "2026-01-01T00:00:00Z" },
      { id: "b", user_id: "u", date: "2026-01-02", description: "Food", category: "Food", type: "expense", amount: 30, project_id: null, created_at: "2026-01-02T00:00:00Z" }
    ]
  } as unknown as Snapshot;
  const lines = transactionsCsv(snap).trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[1].includes(",100,,100,"));
  assert.ok(lines[2].includes(",,30,70,"));
});
