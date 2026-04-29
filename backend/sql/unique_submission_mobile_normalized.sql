-- Optional DB enforcement: one subscription per normalized mobile.
-- Run ONLY after deduplicating rows (same person / same phone → one row).
--
-- Example cleanup (adjust in SQL editor before creating the index):
--   DELETE / merge duplicates so regexp_replace(mobile, '\D', '', 'g') is unique.
--
-- Then:

create unique index if not exists anand_sandesh_subscription_mobile_norm_key
  on public.anand_sandesh_subscription (
    (right(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), 10))
  )
  where mobile is not null
    and length(regexp_replace(coalesce(mobile, ''), '\D', '', 'g')) >= 10;

comment on index public.anand_sandesh_subscription_mobile_norm_key is
  'At most one row per Indian 10-digit mobile (normalized).';
