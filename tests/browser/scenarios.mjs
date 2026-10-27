import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH);
import fs from "node:fs";
const bundle = fs.readFileSync(process.argv[2], "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("https://test.local/**", r => r.fulfill({ contentType: "text/html", body: "<html><body>t</body></html>" }));
page.on("pageerror", e => console.log("PAGEERROR", e.message));
await page.goto("https://test.local/");
await page.addScriptTag({ content: bundle });

const results = await page.evaluate(async () => {
  const { repo, sync, db, cloud, hooks } = window.__t;
  const out = [];
  const check = (name, cond, extra) => out.push({ name, ok: !!cond, extra });
  const reset = async () => {
    for (const k of Object.keys(cloud)) cloud[k] = [];
    hooks.failUpsert = null; hooks.failAll = null; hooks.refuseDelete = false; hooks.upsertLog.length = 0;
    for (const s of ["transactions","categories","notes","projects"]) for (const r of await db.localAll(s)) await db.localDelete(s, r.id);
    for (const q of await db.queueAll()) await db.queueDelete(q.queueId);
    repo.forceNextPull();
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tx = (o = {}) => ({ date: "2026-10-05", description: "d", category: "Food", type: "expense", amount: 10, ...o });
  const cloudTx = (id, o = {}) => ({ id, user_id: "u1", date: "2026-10-01", description: "c", category: "Other", type: "income", amount: 5, project_id: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...o });
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

  // 1. add -> syncs, queue drains, local marked cloud
  await reset();
  const t1 = await repo.addTransaction(tx());
  await sync.flushSyncQueue(); await sleep(50);
  check("add syncs to cloud", cloud.transactions.length === 1 && cloud.transactions[0].id === t1.id);
  check("cloud row has no local-only fields", cloud.transactions[0] && !("_cloud" in cloud.transactions[0]));
  check("queue drained", (await db.queueAll()).length === 0);
  check("local marked _cloud", (await db.localGet("transactions", t1.id))?._cloud);

  // 2. update syncs
  await repo.updateTransaction(t1.id, tx({ amount: 99 }));
  await sync.flushSyncQueue(); await sleep(50);
  check("update syncs", cloud.transactions[0].amount === 99);

  // 3. delete syncs
  await repo.deleteTransaction(t1.id); await sleep(100);
  await sync.flushSyncQueue(); await sleep(50);
  check("delete syncs", cloud.transactions.length === 0 && (await db.localAll("transactions")).length === 0);

  // 4. another device adds -> we get it; another device deletes -> it disappears here
  await reset();
  cloud.transactions.push(cloudTx(uuid(1)), cloudTx(uuid(2)));
  let list = await repo.getTransactions();
  check("pulls other device rows", list.length === 2);
  cloud.transactions = cloud.transactions.filter(r => r.id !== uuid(2));
  repo.forceNextPull();
  list = await repo.getTransactions();
  check("remote delete removes local copy", list.length === 1 && list[0].id === uuid(1), list.map(x => x.id));

  // 5. legacy local-only record (no _cloud marker) is uploaded, never discarded
  await reset();
  await db.localPut("transactions", cloudTx(uuid(7)));
  list = await repo.getTransactions(); await sleep(300);
  check("local-only record kept", list.some(r => r.id === uuid(7)));
  check("local-only record uploaded", cloud.transactions.some(r => r.id === uuid(7)), cloud.transactions.length);

  // 6. paging beyond 1000 rows
  await reset();
  for (let i = 1; i <= 2500; i++) cloud.transactions.push(cloudTx(uuid(i)));
  list = await repo.getTransactions();
  check("pages through 2500 rows", list.length === 2500, list.length);

  // 7. one rejected item doesn't block others
  await reset();
  hooks.failUpsert = (table, row) => row.description === "bad" ? { code: "23514", message: "check violation" } : null;
  await repo.addTransaction(tx({ description: "bad" }));
  const good = await repo.addTransaction(tx({ description: "good" }));
  await sync.flushSyncQueue(); await sleep(50);
  check("good item synced despite rejected one", cloud.transactions.some(r => r.id === good.id));
  check("rejected item kept in queue with error", (await db.queueAll()).length === 1 && (await db.queueAll())[0].last_error);
  check("status reports failure", sync.getSyncStatus().message.startsWith("Sync failed:"), sync.getSyncStatus().message);

  // 8. network-style error (no code) pauses and keeps queue
  await reset();
  await repo.addTransaction(tx());
  hooks.failAll = () => ({ message: "TypeError: Failed to fetch" });
  await sync.flushSyncQueue(); await sleep(50);
  check("network error keeps queue", (await db.queueAll()).length >= 1);
  hooks.failAll = null;
  await sync.flushSyncQueue(); await sleep(50);
  check("recovers when network returns", (await db.queueAll()).length === 0 && cloud.transactions.length === 1);

  // 9. ordering + FK: project then note + transaction referencing it, all created at once
  await reset();
  const p = await repo.saveProject({ name: "Trip" });
  await repo.saveNote({ title: "n", content: "c", project_id: p.id });
  await repo.addTransaction(tx({ project_id: p.id }));
  await sync.flushSyncQueue(); await sleep(50);
  check("project syncs before children (FK ok)", cloud.projects.length === 1 && cloud.notes.length === 1 && cloud.transactions.length === 1 && (await db.queueAll()).length === 0);

  // 10. child pointing to a deleted project is unlinked instead of blocking forever
  await reset();
  await repo.addTransaction(tx({ project_id: uuid(999) }));
  await sync.flushSyncQueue(); await sleep(50);
  check("dangling project ref repaired", cloud.transactions.length === 1 && cloud.transactions[0].project_id === null && (await db.queueAll()).length === 0);

  // 11. delete refused by RLS is detected
  await reset();
  const t = await repo.addTransaction(tx());
  await sync.flushSyncQueue(); await sleep(50);
  hooks.refuseDelete = true;
  await repo.deleteTransaction(t.id); await sleep(50);
  await sync.flushSyncQueue(); await sleep(50);
  check("refused delete is reported, kept queued", (await db.queueAll()).some(q => q.operation === "delete" && q.last_error) && sync.getSyncStatus().message.startsWith("Sync failed:"));

  // 12. deleteProject unlinks children locally and syncs
  await reset();
  const pr = await repo.saveProject({ name: "P" });
  await repo.addTransaction(tx({ project_id: pr.id })); await repo.saveNote({ title: "n", content: "c", project_id: pr.id });
  await sync.flushSyncQueue(); await sleep(50);
  await repo.deleteProject(pr.id); await sleep(100);
  await sync.flushSyncQueue(); await sleep(50);
  const txs = await db.localAll("transactions"), nts = await db.localAll("notes");
  check("project deleted locally + cloud", (await db.localAll("projects")).length === 0 && cloud.projects.length === 0);
  check("children kept but unassigned", txs.length === 1 && txs[0].project_id === null && nts.length === 1 && nts[0].project_id === null && cloud.transactions[0].project_id === null);

  // 13. restore snapshot: adds missing, skips existing
  await reset();
  const keep = await repo.addTransaction(tx({ description: "keep" }));
  const snap = { app: "MonetaTracker", format: 1, projects: [], categories: [], notes: [], transactions: [
    cloudTx(keep.id), cloudTx(uuid(50)), { ...cloudTx(uuid(51)), type: "bogus" }, { ...cloudTx(uuid(52)), user_id: "someone-else" } ] };
  const res = await repo.restoreSnapshot(snap); await sleep(100);
  const all = await db.localAll("transactions");
  check("restore adds new, skips existing and invalid", res.added.transactions === 2 && res.skipped === 2 && all.length === 3, JSON.stringify(res));
  check("restore reassigns to current user", all.every(r => r.user_id === "u1"));
  let threw = false; try { await repo.restoreSnapshot({ hello: 1 }); } catch { threw = true; }
  check("restore rejects non-backup", threw);

  // 14. snapshot contains everything without local-only fields
  await reset();
  await repo.addTransaction(tx()); await repo.addCategory("Pets"); await repo.saveNote({ title: "a", content: "b" });
  await sync.flushSyncQueue(); await sleep(50);
  const s = await repo.loadSnapshot();
  check("snapshot complete + clean", s.transactions.length === 1 && s.categories.length === 1 && s.notes.length === 1 && !JSON.stringify(s).includes("_cloud"));

  // 15. financial start day round trip
  await reset();
  await repo.saveFinancialStartDay(25); await sleep(50);
  await sync.flushSyncQueue(); await sleep(50);
  check("start day saved to profile", hooks.userMetadata.financial_start_day === 25 && (await repo.getFinancialStartDay()) === 25);

  return out;
});

let failed = 0;
for (const r of results) { console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : "  -> " + JSON.stringify(r.extra)}`); if (!r.ok) failed++; }
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
