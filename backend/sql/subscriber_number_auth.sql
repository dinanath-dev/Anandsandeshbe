-- Sequential subscriber numbers (1, 2, 3, …) for verified users.
-- Run in Supabase SQL Editor before / with create_anand_sandesh_subscription.sql.

create sequence if not exists public.subscriber_id_seq as integer start 1 increment 1 minvalue 1;

alter table public.auth_users add column if not exists subscriber_no integer unique;

-- Idempotent: returns existing number or allocates next from sequence.
create or replace function public.alloc_subscriber_no(p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no integer;
  norm text;
begin
  norm := lower(trim(p_email));
  select subscriber_no into v_no from public.auth_users where email = norm;
  if v_no is not null then
    return v_no;
  end if;
  update public.auth_users
  set subscriber_no = nextval('public.subscriber_id_seq')
  where email = norm and subscriber_no is null
  returning subscriber_no into v_no;
  if v_no is not null then
    return v_no;
  end if;
  select subscriber_no into v_no from public.auth_users where email = norm;
  return v_no;
end;
$$;

revoke all on function public.alloc_subscriber_no(text) from public;
grant execute on function public.alloc_subscriber_no(text) to service_role;
