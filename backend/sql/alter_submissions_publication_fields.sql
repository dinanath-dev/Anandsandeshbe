-- Run in Supabase SQL editor if these columns are missing.
alter table public.submissions add column if not exists subscriber_no text;
alter table public.submissions add column if not exists anand_sandesh_lang text;
alter table public.submissions add column if not exists spiritual_bliss text;
