-- MonetaTracker Phase 1 migration
-- Run this in the Supabase SQL Editor.
-- Existing transactions remain valid; notes are optional.

alter table public.transactions
add column if not exists notes text;

-- Financial month start day is stored in each authenticated user's
-- Supabase user_metadata, so no additional table or RLS policy is required.
