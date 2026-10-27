// In-memory stand-in for the Supabase client, used only by the browser test harness.
type Row = Record<string, any>;
export const cloud: Record<string, Row[]> = { transactions: [], categories: [], notes: [], projects: [] };
export const hooks = {
  /** return an error object to make an operation fail; null = succeed */
  failUpsert: null as null | ((table: string, row: Row) => any),
  failAll: null as null | (() => any),
  refuseDelete: false,
  upsertLog: [] as Array<{ table: string; id: string }>,
  userMetadata: {} as Row
};
const USER = { id: "u1", email: "u1@test.dev", user_metadata: hooks.userMetadata };

function builder(table: string) {
  let filters: Array<[string, any]> = [];
  let op: "select" | "delete" = "select";
  let from = 0, to = Infinity, single = false;
  const api: any = {
    select() { return api; },
    eq(col: string, val: any) { filters.push([col, val]); return api; },
    order() { return api; },
    range(a: number, b: number) { from = a; to = b; return api; },
    maybeSingle() { single = true; return api; },
    delete() { op = "delete"; return api; },
    async upsert(row: Row) {
      if (hooks.failAll) { const e = hooks.failAll(); if (e) return { error: e }; }
      const bad = hooks.failUpsert?.(table, row);
      if (bad) return { error: bad };
      if (table === "notes" || table === "transactions") {
        if (row.project_id && !cloud.projects.some(p => p.id === row.project_id)) {
          return { error: { code: "23503", message: "FK violation project_id" } };
        }
      }
      const i = cloud[table].findIndex(r => r.id === row.id);
      if (i >= 0) cloud[table][i] = { ...row }; else cloud[table].push({ ...row });
      hooks.upsertLog.push({ table, id: row.id });
      return { error: null };
    },
    then(resolve: any) {
      if (hooks.failAll) { const e = hooks.failAll(); if (e) return resolve({ data: null, error: e }); }
      const match = (r: Row) => filters.every(([c, v]) => r[c] === v);
      if (op === "delete") {
        if (!hooks.refuseDelete) {
          const ids = new Set(cloud[table].filter(match).map(r => r.id));
          cloud[table] = cloud[table].filter(r => !ids.has(r.id));
          // emulate ON DELETE SET NULL
          if (table === "projects") for (const t of ["notes", "transactions"]) for (const r of cloud[t]) if (ids.has(r.project_id)) r.project_id = null;
        }
        return resolve({ data: null, error: null });
      }
      const rows = cloud[table].filter(match).sort((a, b) => (a.id < b.id ? -1 : 1));
      if (single) return resolve({ data: rows[0] ?? null, error: null });
      return resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
    }
  };
  return api;
}

export const supabase = {
  from: (t: string) => builder(t),
  auth: {
    async getSession() { return { data: { session: { user: USER } }, error: null }; },
    async getUser() { return { data: { user: USER }, error: null }; },
    async updateUser({ data }: any) { Object.assign(hooks.userMetadata, data); return { error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
  }
};
