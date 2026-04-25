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

function parseSubscriberKey(id) {
  const key = typeof id === 'number' ? id : Number(id);
  if (!Number.isInteger(key) || key < 1) return null;
  return key;
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
  const key = parseSubscriberKey(id);
  if (key == null) throw new AppError('Submission not found.', 404);

  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .update(withoutUndefined(payload))
    .eq('subscriber_no', key)
    .select()
    .single();

  if (error) throw new AppError(error.message, 500);
  return withLegacyId(data);
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

export async function findSubmissionById(id) {
  const key = parseSubscriberKey(id);
  if (key == null) throw new AppError('Submission not found.', 404);

  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq('subscriber_no', key)
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
