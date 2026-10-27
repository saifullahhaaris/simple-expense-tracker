# MonetaTracker (React)

React + TypeScript + Vite rewrite of the plain HTML/CSS/JS app. **Same look, same features, same Supabase project**,
so all existing users and data carry over with no migration.

## What stays the same (on purpose)
- Supabase project, tables, and login (`moneta-auth` storage key): existing sessions keep working.
- Local offline database (`monetatracker-local-v1`): changes still waiting to sync on any device are picked up.
- Theme preference key, financial-month setting, and the original stylesheet (`src/styles/legacy.css`).

## What is new
- Hamburger menu: page links, light/dark theme, sync status + "Sync now", Backup & export, Log out.
- **Backup & export** page: Excel (.xlsx), CSV, full JSON backup, and restore from JSON (non-destructive).
- **Balance fixed**: the running balance now carries money forward from earlier periods (it used to restart at 0 every
  financial period). The Balance card shows the closing balance, with "Brought forward" underneath.
- All sync fixes from the previous round (cross-device deletes, >1000 rows, per-item error isolation, verified deletes,
  deterministic ordering, project delete).
- `npm run backup:all`: admin script that dumps every user's data to JSON (needs the service-role key).

## Run
```bash
npm install
cp .env.example .env     # optional; defaults to the existing Supabase project
npm run dev              # http://localhost:5173
npm test                 # ledger / date / export unit tests
npm run typecheck
npm run build            # -> dist/
```

## Deploy
Upload `dist/` (or connect the repo) to the same host. It is a single-page app, so unknown paths must serve `index.html`:
`public/_redirects` (Netlify, Cloudflare Pages) and `vercel.json` are included, and the build also writes `404.html`
(GitHub Pages). Old URLs such as `/dashboard.html` redirect to the new routes. The new service worker replaces the old
one and clears its caches on first load. **Deploy to a preview/second URL first and check with a test account.**

## Browser-level sync tests (optional)
`tests/browser` runs the real sync engine in Chromium against an in-memory fake Supabase (26 scenarios: delete
propagation, paging, rejected items, FK repair, restore...). It needs Playwright and esbuild; see `run.mjs` and `scenarios.mjs`.

## Database
No schema change is required beyond `projects-and-sync-migration.sql` from the previous version. If edits or deletes ever
fail with a "policy" error, run `sync-policies.sql` (kept in the old project folder) once.

## Backups of all 3 users
`SUPABASE_SERVICE_ROLE_KEY=... npm run backup:all` writes `backups/<time>/<email>.json` per user, in the same format the app's
Restore button reads. Also enable Supabase's own database backups for the project (Dashboard > Database > Backups).
