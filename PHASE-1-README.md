# MonetaTracker Phase 1 changes

## Included
- Per-user financial month start day (1–31), stored in Supabase Auth user metadata.
- Dashboard navigation between financial periods; only transactions within the selected period are shown.
- Optional transaction notes saved with each transaction.
- Charts date-range presets: current/previous financial period, last 7 days, last 30 days, current calendar month, all time, and custom dates. All charts use the selected range.

## Before deploying
1. In Supabase SQL Editor, run `phase1-migration.sql` to add the nullable `notes` column.
2. Replace the current project files with the files in this folder, preserving your existing `js/supabase.js` configuration.
3. Test in a local server before deploying to Vercel.

## Financial period behavior
A period starts on the selected day and ends the day before the next period begins. For months that do not contain the selected day, the start date is clamped to that month's last day. For example, choosing 31 means February's period starts on February's last day.

## Notes
- No transaction dates are changed by changing the financial month preference.
- The dashboard's balance is income minus expenses within the selected period, not a carried-forward account balance.
- Offline editing is not part of Phase 1; it is planned for a later phase.
