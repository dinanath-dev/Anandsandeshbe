-- Optional: match submissions by mobile regardless of formatting (offline imports).
-- Run in Supabase SQL editor if .in('mobile', variants) misses rows.

create or replace function public.submissions_matching_mobile(p_digits text)
returns setof public.anand_sandesh_subscription
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.anand_sandesh_subscription s
  where length(regexp_replace(coalesce(p_digits, ''), '\D', '', 'g')) >= 10
    and right(regexp_replace(coalesce(s.mobile::text, ''), '\D', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_digits, ''), '\D', '', 'g'), 10);
$$;

revoke all on function public.submissions_matching_mobile(text) from public;
grant execute on function public.submissions_matching_mobile(text) to service_role;
