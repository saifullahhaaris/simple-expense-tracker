-- Run this once in Supabase SQL Editor.
create policy "Users can update their own transactions"
on transactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
