# MonetaTracker Phase 2

## Included
- Four-item fixed footer navigation: Dashboard, Projects, Notes, Charts.
- A simple sticky-notes page for reminders, loan settlement, bills and due dates. Notes can be created, edited, pinned and deleted.
- IndexedDB local storage and an ordered synchronization queue for transactions, categories, and notes.
- Online/offline/sync status indicator.
- PWA manifest and app icon, plus service worker app-shell caching for installable/offline-capable web usage.
- Removed the Daily / Weekly / Monthly chart buttons; chart granularity is chosen automatically from the selected range.

## Before deploying
1. Back up your current repository and test this build in a separate branch or preview deployment.
2. In Supabase SQL Editor, run `phase2-migration.sql` to create the notes table, RLS policies, and indexes.
3. Confirm `js/supabase.js` still contains your project's URL and publishable key only. Never put a service-role/secret key in browser code.
4. Serve over HTTPS (Vercel does this automatically) or localhost. Service workers do not work reliably from `file://`.
5. Sign in online, open Dashboard, Notes and Charts at least once so the app shell and current records are cached on that device.
6. Test offline by using browser devtools Network > Offline: create/edit/delete transactions and notes, reload each page, then restore the connection and confirm the sync indicator returns to Synced.
7. Verify changes on a second device after sync. Test with a non-production account first.

## Offline limitations and important safety notes
- Offline use requires the user to have signed in successfully on that device before going offline. First-time sign-in cannot happen offline.
- IndexedDB is browser-local and can be cleared by the user/browser. It is not a backup. Keep Supabase backups and exports.
- Sync is queued in order and uses stable client-generated IDs so retried inserts are idempotent. If the same record is edited on multiple devices while offline, this version uses last synchronized write behavior; conflict resolution is not yet implemented. Avoid concurrent offline edits to the same record across devices.
- Browser background sync is not guaranteed by every browser; pending changes sync when the app is open and online or when it next loads online.
- Notes require the SQL migration before the Notes page can sync to Supabase. Local notes may still save, but sync will remain pending until the table exists.
- This is a static web app; PWA installation is browser-dependent and no Play Store publication is required.
