# MonetaTracker sync repair and Projects setup

## Before deploying
1. In the Supabase dashboard, open **SQL Editor**.
2. Run `projects-and-sync-migration.sql`. It is designed to be re-run safely and keeps existing transaction rows. It adds `transactions.updated_at` (missing from the included migrations but sent by the app), creates the projects table and adds nullable project links.
3. Deploy the whole updated folder to your existing hosting project. Do not deploy only `projects.html`; the new JS files and service worker are required.
4. Open the deployed app while online, sign in, and wait for the status to show **Synced**. Refresh once after the migration so pending records can retry.

## Important sync notes
- Do **not** clear browser data or delete IndexedDB to fix this. Existing offline changes may still be queued there.
- If the status says **Sync error · see details**, hover/tap the status if your browser exposes its title, or open Developer Tools → Console and look for `MonetaTracker sync is waiting`. The full Supabase error is logged there.
- If older changes remain pending after the migration, reload while online. The queue is retried on page load and when connectivity returns.
- This project cannot verify your live Supabase schema or test a real account from this package, so test with one harmless sample transaction and note before relying on it.

## Projects behavior
- Create and edit projects on **My Projects**. Archiving hides a project from the default list but can be reversed with **Show archived**.
- Open a project for its own income/expense/balance summary, transactions, chart and notes.
- Project transactions are single records with a `project_id`; they also remain visible in the main transaction history and are not duplicated.
- Existing transactions and notes stay unassigned (`project_id = null`) and are not changed by the migration.
- Project notes also appear in the general Notes page because they are the same note records.
