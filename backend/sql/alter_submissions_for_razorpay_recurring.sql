-- Extend submissions table for Razorpay recurring subscriptions.
-- Run this on existing environments before enabling webhook processing.

alter table public.anand_sandesh_subscription
  add column if not exists plan_id text,
  add column if not exists razorpay_subscription_id text,
  add column if not exists razorpay_payment_id text;

-- Expand allowed payment states for recurring lifecycle.
alter table public.anand_sandesh_subscription
  drop constraint if exists anand_sandesh_subscription_payment_status_check;

alter table public.anand_sandesh_subscription
  add constraint anand_sandesh_subscription_payment_status_check
  check (payment_status in ('pending', 'verified', 'failed', 'cancelled'));

create index if not exists anand_sandesh_subscription_razorpay_subscription_id_idx
  on public.anand_sandesh_subscription (razorpay_subscription_id);

create index if not exists anand_sandesh_subscription_razorpay_payment_id_idx
  on public.anand_sandesh_subscription (razorpay_payment_id);
