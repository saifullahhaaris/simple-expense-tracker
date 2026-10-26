-- MonetaTracker: make sure every synced table lets a user read/insert/update/delete ONLY their own rows.
-- Safe to re-run (drop-if-exists + create). It does not touch your data.
-- A missing DELETE or UPDATE policy is the usual cause of "delete/edit doesn't stick" or "Sync error".
-- To CHECK first (read-only):  select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and tablename in ('transactions','categories','notes','projects') order by 1,3;

do $$
declare t text;
begin
  foreach t in array array['transactions','categories','notes','projects'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'moneta_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)', 'moneta_select_own', t);
    execute format('drop policy if exists %I on public.%I', 'moneta_insert_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)', 'moneta_insert_own', t);
    execute format('drop policy if exists %I on public.%I', 'moneta_update_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', 'moneta_update_own', t);
    execute format('drop policy if exists %I on public.%I', 'moneta_delete_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)', 'moneta_delete_own', t);
  end loop;
end $$;
