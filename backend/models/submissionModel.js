import { supabase } from '../utils/supabaseClient.js';
import { AppError } from '../utils/AppError.js';

/** Supabase table: Anand Sandesh subscription form data (snake_case SQL name). */
const SUBMISSIONS_TABLE =
  process.env.SUBMISSIONS_TABLE || 'anand_sandesh_subscription';

function withoutUndefined(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
}

/** API + admin UI expect `id` — prefer subscriber_no when set, else UUID `id`. */
function withLegacyId(row) {
  if (!row) return row;
  const id = row.subscriber_no != null ? row.subscriber_no : row.id;
  return { ...row, id };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseSubscriberKey(id) {
  const key = typeof id === 'number' ? id : Number(id);
  if (!Number.isInteger(key) || key < 1) return null;
  return key;
}

/** Resolve DB row by sequential subscriber_no or UUID primary key (legacy imports). */
export function parseRowLookupKey(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return { column: 'subscriber_no', value: raw };
  }
  const s = String(raw).trim();
  if (UUID_RE.test(s)) return { column: 'id', value: s };
  const n = Number(s);
  if (Number.isInteger(n) && n > 0) return { column: 'subscriber_no', value: n };
  return null;
}

/** Last 10 digits for matching rows that store 10-digit, +91, spaces, etc. */
export function normalizeIndianMobile(raw) {
  if (raw == null) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.length >= 10) return d.slice(-10);
  return d.length > 0 ? d : null;
}

function mobileStoredVariants(digits10) {
  return [
    ...new Set([
      digits10,
      `0${digits10}`,
      `91${digits10}`,
      `+91${digits10}`,
      `+91 ${digits10}`,
      `91 ${digits10}`
    ])
  ];
}

/** Submissions whose stored mobile normalizes to the same 10-digit number. */
export async function findSubmissionsByMobileDigits(digits10) {
  if (!digits10 || String(digits10).length !== 10) return [];

  try {
    const { data, error } = await supabase.rpc('submissions_matching_mobile', {
      p_digits: digits10
    });
    if (!error && Array.isArray(data)) {
      return data.map(withLegacyId);
    }
  } catch {
    /* RPC not installed — fall back */
  }

  const variants = mobileStoredVariants(digits10);
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .in('mobile', variants);

  if (error) throw new AppError(error.message, 500);

  let rows = (data || []).filter((row) => normalizeIndianMobile(row.mobile) === digits10);

  if (rows.length === 0) {
    const { data: wide, error: wideErr } = await supabase
      .from(SUBMISSIONS_TABLE)
      .select('*')
      .ilike('mobile', `%${digits10}%`)
      .limit(80);
    if (!wideErr && wide?.length) {
      rows = wide.filter((row) => normalizeIndianMobile(row.mobile) === digits10);
    }
  }

  return rows.map(withLegacyId);
}

/** Match pin (exact trim) + house_no and street (case-insensitive trim). */
export async function findSubmissionsByAddressMatch({ house_no, street, pin }) {
  const p = String(pin || '').trim();
  const h = String(house_no || '').trim().toLowerCase();
  const st = String(street || '').trim().toLowerCase();
  if (!p || !h || !st) return [];

  const { data, error } = await supabase.from(SUBMISSIONS_TABLE).select('*').eq('pin', p);

  if (error) throw new AppError(error.message, 500);

  const rows = (data || []).filter((row) => {
    const rh = String(row.house_no || '').trim().toLowerCase();
    const rs = String(row.street || '').trim().toLowerCase();
    return rh === h && rs === st;
  });
  return rows.map(withLegacyId);
}

export async function createSubmission(payload) {
  const clean = withoutUndefined(payload);
  const subNo = clean.subscriber_no;

  // Avoid PostgREST upsert: it requires a UNIQUE/PK on the conflict column. Older DBs may only have UUID PK.
  if (subNo != null && subNo !== '') {
    const { data: existing, error: selErr } = await supabase
      .from(SUBMISSIONS_TABLE)
      .select('subscriber_no')
      .eq('subscriber_no', subNo)
      .maybeSingle();

    if (selErr) throw new AppError(selErr.message, 500);
    if (existing) {
      const { data, error } = await supabase
        .from(SUBMISSIONS_TABLE)
        .update(clean)
        .eq('subscriber_no', subNo)
        .select()
        .single();
      if (error) throw new AppError(error.message, 500);
      return withLegacyId(data);
    }
  }

  const { data, error } = await supabase.from(SUBMISSIONS_TABLE).insert(clean).select().single();
  if (error) throw new AppError(error.message, 500);
  return withLegacyId(data);
}

export async function updateSubmission(id, payload) {
  const loc = parseRowLookupKey(id);
  if (!loc) throw new AppError('Submission not found.', 404);

  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .update(withoutUndefined(payload))
    .eq(loc.column, loc.value)
    .select()
    .single();

  if (error) throw new AppError(error.message, 500);
  return withLegacyId(data);
}

export async function deleteSubmissionBySubscriberNo(rawId) {
  const loc = parseRowLookupKey(rawId);
  if (!loc) throw new AppError('Submission not found.', 404);
  const { error } = await supabase.from(SUBMISSIONS_TABLE).delete().eq(loc.column, loc.value);
  if (error) throw new AppError(error.message, 500);
}

export async function listSubmissions(status, { ascending = false } = {}) {
  let query = supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .order('created_at', { ascending });

  if (status) query = query.eq('payment_status', status);

  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500);
  return (data || []).map(withLegacyId);
}

export async function findSubmissionById(rawId) {
  const loc = parseRowLookupKey(rawId);
  if (!loc) throw new AppError('Submission not found.', 404);

  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq(loc.column, loc.value)
    .single();

  if (error) throw new AppError('Submission not found.', 404);
  return withLegacyId(data);
}

export async function findSubmissionBySubscriberNo(subscriberNo) {
  const key = parseSubscriberKey(subscriberNo);
  if (key == null) return null;
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq('subscriber_no', key)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data ? withLegacyId(data) : null;
}

/** Latest row for this user: subscriber_no match first, else email (same subscriber_no as auth after allocate). */
export async function findSubmissionForUser(email, subscriberNo) {
  const norm = String(email || '').trim().toLowerCase();
  const key = parseSubscriberKey(subscriberNo);

  if (key != null) {
    const { data, error } = await supabase
      .from(SUBMISSIONS_TABLE)
      .select('*')
      .eq('subscriber_no', key)
      .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (data) {
      const row = withLegacyId(data);
      const rowEmail = row.email ? String(row.email).trim().toLowerCase() : '';
      if (!rowEmail || rowEmail === norm) return row;
    }
  }

  if (norm) {
    const { data, error } = await supabase
      .from(SUBMISSIONS_TABLE)
      .select('*')
      .eq('email', norm)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (data) return withLegacyId(data);
  }

  return null;
}

export async function findSubmissionByRazorpaySubscriptionId(razorpaySubscriptionId) {
  const key = String(razorpaySubscriptionId || '').trim();
  if (!key) return null;
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq('razorpay_subscription_id', key)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data ? withLegacyId(data) : null;
}

export async function findSubmissionByRazorpayPaymentId(razorpayPaymentId) {
  const key = String(razorpayPaymentId || '').trim();
  if (!key) return null;
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq('razorpay_payment_id', key)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data ? withLegacyId(data) : null;
}
