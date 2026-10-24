-- MonetaTracker Phase 2: independent sticky notes table and secure per-user access.
-- Run in Supabase SQL Editor before deploying the Notes page.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null,
  pinned boolean not null default false,
  color text not null default 'yellow' check (color in ('yellow','blue','pink','green')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;

drop policy if exists "Users can view their own notes" on public.notes;
create policy "Users can view their own notes" on public.notes for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create their own notes" on public.notes;
create policy "Users can create their own notes" on public.notes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own notes" on public.notes;
create policy "Users can update their own notes" on public.notes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own notes" on public.notes;
create policy "Users can delete their own notes" on public.notes for delete to authenticated using (auth.uid() = user_id);

create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date);

-- Categories use idempotent upserts for offline retries.
drop policy if exists "Users can update their own categories" on public.categories;
create policy "Users can update their own categories" on public.categories for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
