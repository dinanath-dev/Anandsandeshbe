-- Fresh install: auth tables aligned with backend authController + authModel
-- Env: AUTH_USER_TABLE (default auth_users), AUTH_OTP_TABLE (default auth_otps)

create extension if not exists pgcrypto;

create table if not exists public.auth_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  subscriber_no integer unique,
  full_name text,
  password_hash text,
  last_auth_mode text not null default 'signup' check (last_auth_mode in ('signup', 'login')),
  is_verified boolean not null default true,
  last_login_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  mode text not null check (mode in ('signup', 'login', 'reset')),
  otp_hash text not null,
  password_hash text,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_otps_expires_at_idx on public.auth_otps (expires_at);
create index if not exists auth_users_email_idx on public.auth_users (email);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_auth_users_updated_at on public.auth_users;
create trigger set_auth_users_updated_at
before update on public.auth_users
for each row
execute function public.set_updated_at();

drop trigger if exists set_auth_otps_updated_at on public.auth_otps;
create trigger set_auth_otps_updated_at
before update on public.auth_otps
for each row
execute function public.set_updated_at();
