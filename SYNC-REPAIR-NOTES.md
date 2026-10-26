# MonetaTracker sync repair notes

## What changed in this repair

- A record write and its sync-queue entry are committed in one IndexedDB transaction. This avoids saving a local edit without a matching queue item if the browser closes or a write fails between separate operations.
- A local delete and its queued cloud deletion are committed atomically, so a delete cannot be removed locally before its retry job is stored.
- The sync worker drains the queue one item at a time and removes a queue item only after the corresponding Supabase operation succeeds.
- A save that happens while a sync is already running requests another pass instead of being left until the next reload.
- Sync retries after the Supabase auth session is initialized or signed in, and when the app returns online/focus.
- A cloud response is no longer written over a potentially newer local edit during the same sync pass.\n- A cloud fetch never deletes local-only records merely because they are absent from the response; this protects older local data that may not have a queue entry.
- Upserts no longer request a returned row. This avoids making successful writes depend on a SELECT policy just to receive the response; normal Row Level Security still applies.
- The service-worker cache version was incremented so browsers can install the updated JavaScript.

## Important limitations

This is a code-level repair, not proof that the live Supabase project is configured correctly. Because this version prioritizes preserving local data, a record deleted remotely on another device may remain in this device’s local cache until a safe deletion/tombstone mechanism is implemented. Do not treat a cross-device deletion as fully synchronized until that behavior is designed and tested. Real sync still depends on the deployed database schema and policies, valid login sessions, and a real online test. The package cannot inspect your live Supabase project.

Do not clear browser data, delete IndexedDB, or delete the sync queue to troubleshoot this issue. Do not run database migrations blindly against a live database. First verify which migrations have already been applied and inspect the policies on `transactions`, `categories`, `notes`, and `projects`.

## Safe rollout and validation

1. Keep a backup of the current project and do not clear site data.
2. Deploy the updated files together, including `js/storage.js` and `service-worker.js`. The service worker cache version was bumped to `monetatracker-shell-v4`.
3. Sign in online on a device with a known, backed-up account.
4. Add one harmless test transaction and note; wait for the status to show `Synced`.
5. Open the same account on a second browser/device and verify the test records appear.
6. On the first device, go offline, edit a harmless test record, then reconnect. Verify it syncs once and remains correct after refresh.
7. Test deletion only with a disposable test record.
8. Check the browser console and the sync status if any item stays pending. Do not assume that a green/“Synced” status proves every historical queue item or every device has been checked.

Because this app contains real user data, test with a harmless record first and retain the original deployment until the checks pass.
