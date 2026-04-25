-- Run once in Supabase → SQL Editor (fixes "new row violates row-level security policy" on auth_otps).
-- These tables are for your Node backend only. After this:
--   • RLS stops blocking inserts/updates.
--   • anon / authenticated cannot read or write them (only service_role + postgres).
-- Your backend MUST use SUPABASE_SERVICE_ROLE_KEY = service_role secret (Dashboard → API Keys).

do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('auth_otps', 'auth_users')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      pol.policyname,
      pol.tablename
    );
  end loop;
end $$;

alter table if exists public.auth_otps disable row level security;
alter table if exists public.auth_users disable row level security;

revoke all on table public.auth_otps from anon;
revoke all on table public.auth_users from anon;
revoke all on table public.auth_otps from authenticated;
revoke all on table public.auth_users from authenticated;

grant all on table public.auth_otps to service_role;
grant all on table public.auth_users to service_role;
