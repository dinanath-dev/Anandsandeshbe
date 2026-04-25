-- Run in Supabase SQL editor if auth was created from an older create_auth_tables.sql.
-- Brings schema in line with backend/controllers/authController.js and authModel.js.
--
-- If you see: "new row violates row-level security policy for table auth_otps"
-- 1) Use service_role in SUPABASE_SERVICE_ROLE_KEY (Dashboard → API Keys).
-- 2) Run fix_auth_rls_backend_only.sql in the SQL editor (drops policies, disables RLS, revokes anon).

-- auth_users: password storage + optional unverified rows
alter table public.auth_users add column if not exists password_hash text;
alter table public.auth_users add column if not exists subscriber_no integer unique;

-- auth_otps: pending signup password + forgot-password flow
alter table public.auth_otps add column if not exists password_hash text;

-- Allow password reset OTP mode (was signup|login only)
alter table public.auth_otps drop constraint if exists auth_otps_mode_check;
alter table public.auth_otps
  add constraint auth_otps_mode_check
  check (mode in ('signup', 'login', 'reset'));
