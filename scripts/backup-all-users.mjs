// Admin backup of EVERY user's data (all accounts) to JSON files, straight from Supabase.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run backup:all
//
// The service-role key bypasses Row Level Security: keep it secret, never put it in the app or
// commit it. Find it in Supabase > Project Settings > API. Output goes to ./backups/<timestamp>/.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.SUPABASE_URL ?? "https://xflbjraordcyobcqkuya.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY (Supabase > Project Settings > API > service_role).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const tables = ["projects", "categories", "notes", "transactions"];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = `backups/${stamp}`;
mkdirSync(dir, { recursive: true });

async function all(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const data = {};
for (const table of tables) {
  data[table] = await all(table);
  console.log(`${table}: ${data[table].length} rows`);
}

const { data: userList, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (error) throw error;
const emailOf = new Map(userList.users.map(u => [u.id, u.email]));

// One file per user, in the same format the app's Restore button reads.
const byUser = new Map();
for (const table of tables) {
  for (const row of data[table]) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, { projects: [], categories: [], notes: [], transactions: [] });
    byUser.get(row.user_id)[table].push(row);
  }
}
for (const [id, rows] of byUser) {
  const email = emailOf.get(id) ?? id;
  const snapshot = { app: "MonetaTracker", format: 1, exported_at: new Date().toISOString(), user: { id, email }, financial_start_day: 1, ...rows };
  writeFileSync(`${dir}/${String(email).replace(/[^a-z0-9@._-]/gi, "_")}.json`, JSON.stringify(snapshot, null, 2));
  console.log(`wrote ${email}: ${rows.transactions.length} transactions`);
}
writeFileSync(`${dir}/ALL-raw.json`, JSON.stringify(data));
console.log(`Done -> ${dir}`);
