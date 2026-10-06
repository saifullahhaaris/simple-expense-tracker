-- Add a category to every transaction.
-- Run this once in Supabase SQL Editor.

alter table transactions
add column if not exists category text;

update transactions
set category = 'Other'
where category is null or trim(category) = '';

alter table transactions
alter column category set default 'Other';

alter table transactions
alter column category set not null;
