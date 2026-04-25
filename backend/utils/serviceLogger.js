/** Safe diagnostics for logs (no secrets). */
import { logger } from './logger.js';

/** Supabase legacy keys are JWTs; `role` claim must be service_role for backend RLS bypass. */
export function inferSupabaseServiceKeyRole(key) {
  if (!key || typeof key !== 'string') return 'missing';
  const parts = key.trim().split('.');
  if (parts.length !== 3) return 'non-jwt-format';
  try {
    const json = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return json.role || 'unknown-jwt';
  } catch {
    return 'invalid-jwt';
  }
}

export function redactSupabaseUrl(url) {
  if (!url || typeof url !== 'string') return '(missing)';
  try {
    const u = new URL(url.trim());
    const path = u.pathname && u.pathname !== '/' ? u.pathname : '';
    return `${u.protocol}//${u.hostname}${path}`;
  } catch {
    return '(invalid SUPABASE_URL — must be https://….supabase.co)';
  }
}

function pickCause(c) {
  if (c == null) return undefined;
  if (typeof c !== 'object') return String(c);
  return {
    name: c.name,
    message: c.message,
    code: c.code,
    errno: c.errno,
    syscall: c.syscall,
    address: c.address,
    port: c.port
  };
}

export function logSupabaseFailure(operation, error, extra = {}) {
  const payload = {
    where: 'supabase',
    operation,
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    cause: pickCause(error?.cause),
    ...extra
  };
  logger.error('supabase.failure', payload);
}

export function logStartupServices() {
  const url = process.env.SUPABASE_URL;
  const smtpHost = process.env.SMTP_HOST || '';
  const smtpOk = Boolean(smtpHost && process.env.SMTP_USER && process.env.SMTP_PASS);
  const keyRole = inferSupabaseServiceKeyRole(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const sheetsId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const sheetsCreds =
    Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());

  logger.info('startup.services.ready', {
    supabase: Boolean(url) && keyRole === 'service_role',
    googleSheets: Boolean(sheetsId && sheetsCreds),
    smtp: smtpOk,
    env: process.env.NODE_ENV || 'development'
  });

  if (!url || !/^https:\/\//i.test(String(url).trim())) {
    logger.warn('startup.supabase.url.invalid');
  }
  if (!smtpOk) {
    logger.warn('startup.smtp.incomplete');
  }
  if (keyRole === 'anon' || keyRole === 'authenticated') {
    logger.warn('startup.supabase.role.notServiceRole', { role: keyRole });
  }
  if (keyRole === 'non-jwt-format') {
    logger.warn('startup.supabase.key.nonJwt');
  }
}
