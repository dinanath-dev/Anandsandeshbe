import { supabase } from '../utils/supabaseClient.js';
import { AppError } from '../utils/AppError.js';
import { logSupabaseFailure } from '../utils/serviceLogger.js';

const OTP_TABLE = process.env.AUTH_OTP_TABLE || 'auth_otps';
const USER_TABLE = process.env.AUTH_USER_TABLE || 'auth_users';

function fail(error, fallback = 'Auth data request failed.', statusCode = 500, operation = 'supabase') {
  const base = error?.message || fallback;
  const c = error?.cause;
  const hint =
    c && typeof c === 'object' && ('code' in c || 'message' in c)
      ? ` — ${[c.code, c.message].filter(Boolean).join(': ')}`
      : '';

  logSupabaseFailure(operation, error, { fallback });

  throw new AppError(`${base}${hint}`, statusCode);
}

/** Assign or return existing sequential subscriber number (1, 2, 3, …). Requires subscriber_number_auth.sql RPC. */
export async function allocateSubscriberNo(email) {
  const norm = String(email || '')
    .trim()
    .toLowerCase();
  const { data, error } = await supabase.rpc('alloc_subscriber_no', { p_email: norm });
  if (error) fail(error, 'Could not assign subscriber number.', 500, 'alloc_subscriber_no');
  if (data == null || data === '') {
    throw new AppError('Subscriber number unavailable. Ensure SQL subscriber_number_auth.sql was applied.', 500);
  }
  return Number(data);
}

export async function upsertOtpRecord(payload) {
  const { data, error } = await supabase
    .from(OTP_TABLE)
    .upsert(payload, { onConflict: 'email' })
    .select()
    .single();

  if (error) fail(error, 'Could not create OTP record.', 500, `upsertOtpRecord:${OTP_TABLE}`);
  return data;
}

export async function findOtpRecordByEmail(email) {
  const { data, error } = await supabase
    .from(OTP_TABLE)
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) fail(error, 'Could not load OTP record.', 500, `findOtpRecordByEmail:${OTP_TABLE}`);
  return data;
}

export async function updateOtpRecordByEmail(email, payload) {
  const { data, error } = await supabase
    .from(OTP_TABLE)
    .update(payload)
    .eq('email', email)
    .select()
    .single();

  if (error) fail(error, 'Could not update OTP record.', 500, `updateOtpRecordByEmail:${OTP_TABLE}`);
  return data;
}

export async function deleteOtpRecordByEmail(email) {
  const { error } = await supabase
    .from(OTP_TABLE)
    .delete()
    .eq('email', email);

  if (error) fail(error, 'Could not remove OTP record.', 500, `deleteOtpRecordByEmail:${OTP_TABLE}`);
}

export async function upsertAuthUser(payload) {
  const { data, error } = await supabase
    .from(USER_TABLE)
    .upsert(payload, { onConflict: 'email' })
    .select()
    .single();

  if (error) fail(error, 'Could not save user profile.', 500, `upsertAuthUser:${USER_TABLE}`);
  return data;
}

export async function findAuthUserByEmail(email) {
  const { data, error } = await supabase
    .from(USER_TABLE)
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) fail(error, 'Could not load user profile.', 500, `findAuthUserByEmail:${USER_TABLE}`);
  return data;
}

export async function updateAuthUserByEmail(email, payload) {
  const { data, error } = await supabase
    .from(USER_TABLE)
    .update(payload)
    .eq('email', email)
    .select()
    .single();

  if (error) fail(error, 'Could not update user profile.', 500, `updateAuthUserByEmail:${USER_TABLE}`);
  return data;
}
