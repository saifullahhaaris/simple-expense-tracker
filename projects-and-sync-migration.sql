-- MonetaTracker sync repair + Projects feature. Run once in Supabase SQL Editor.
-- Safe to re-run. Existing records remain; project_id is nullable for existing transactions/notes.

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

alter table public.transactions add column if not exists notes text;
alter table public.transactions add column if not exists category text not null default 'Other';
alter table public.transactions add column if not exists updated_at timestamptz not null default now();
alter table public.transactions add column if not exists project_id uuid;
alter table public.notes add column if not exists project_id uuid;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  budget numeric(12,2) null check (budget is null or budget >= 0),
  target_date date null,
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_project_id_fkey') then
    alter table public.transactions add constraint transactions_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notes_project_id_fkey') then
    alter table public.notes add constraint notes_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end $$;

alter table public.projects enable row level security;
drop policy if exists "Users can view their own projects" on public.projects;
create policy "Users can view their own projects" on public.projects for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create their own projects" on public.projects;
create policy "Users can create their own projects" on public.projects for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects" on public.projects for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects" on public.projects for delete to authenticated using (auth.uid() = user_id);

create index if not exists projects_user_updated_idx on public.projects(user_id, updated_at desc);
create index if not exists transactions_user_project_date_idx on public.transactions(user_id, project_id, date);
create index if not exists notes_user_project_updated_idx on public.notes(user_id, project_id, updated_at desc);
