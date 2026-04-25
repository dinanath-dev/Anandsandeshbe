-- Anand Sandesh — subscription form + payment rows.
-- subscriber_no is the primary key (1, 2, 3, …), same value as auth_users.subscriber_no for that email.
--
-- If you already created the old UUID-based table, run first:
--   DROP TABLE public.anand_sandesh_subscription CASCADE;
-- Then run subscriber_number_auth.sql (if not yet) and this file.

create extension if not exists pgcrypto;

create table if not exists public.anand_sandesh_subscription (
  subscriber_no integer primary key references public.auth_users (subscriber_no) on delete restrict,
  name text,
  mobile text,
  email text,
  gender text,
  address text,
  house_no text,
  street text,
  area text,
  town text,
  district text,
  state text,
  pin text,
  rehbar text,
  anand_sandesh_lang text,
  spiritual_bliss text,
  subscription_type text,
  transaction_id text,
  screenshot_url text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anand_sandesh_subscription_email_idx
  on public.anand_sandesh_subscription (email);
create index if not exists anand_sandesh_subscription_payment_status_idx
  on public.anand_sandesh_subscription (payment_status);
create index if not exists anand_sandesh_subscription_created_at_idx
  on public.anand_sandesh_subscription (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_anand_sandesh_subscription_updated_at on public.anand_sandesh_subscription;
create trigger set_anand_sandesh_subscription_updated_at
before update on public.anand_sandesh_subscription
for each row
execute function public.set_updated_at();

alter table public.anand_sandesh_subscription disable row level security;
revoke all on table public.anand_sandesh_subscription from anon;
revoke all on table public.anand_sandesh_subscription from authenticated;
grant all on table public.anand_sandesh_subscription to service_role;

comment on table public.anand_sandesh_subscription is 'Anand Sandesh subscription form + payment (PK = subscriber_no)';
