/** Safe diagnostics for logs (no secrets). */

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
  console.error('[supabase]', JSON.stringify(payload));
}

export function logStartupServices() {
  const url = process.env.SUPABASE_URL;
  const smtpHost = process.env.SMTP_HOST || '';
  const smtpOk = Boolean(smtpHost && process.env.SMTP_USER && process.env.SMTP_PASS);
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || '';
  const keyRole = inferSupabaseServiceKeyRole(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const sheetsId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const sheetsCreds =
    Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) ||
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());

  console.log('[startup] Service summary (see JSON on next line)');
  console.log(
    '[startup]',
    JSON.stringify({
      supabaseTarget: redactSupabaseUrl(url),
      supabaseUrlLength: url ? url.length : 0,
      supabaseServiceKeyJwtRole: keyRole,
      submissionsTable: process.env.SUBMISSIONS_TABLE || 'anand_sandesh_subscription',
      googleSheetsMirror: Boolean(sheetsId && sheetsCreds),
      smtpConfigured: smtpOk,
      smtpHost: smtpHost || null,
      smtpPort: String(process.env.SMTP_PORT || 587),
      smtpSecure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      mailFromSet: Boolean(from),
      nodeEnv: process.env.NODE_ENV || 'development'
    })
  );

  if (!url || !/^https:\/\//i.test(String(url).trim())) {
    console.warn('[startup] SUPABASE_URL should be a full https URL in backend/.env');
  }
  if (!smtpOk) {
    console.warn(
      '[startup] SMTP not fully configured (SMTP_HOST, SMTP_USER, SMTP_PASS). OTP will log to console in development only.'
    );
  }
  if (keyRole === 'anon' || keyRole === 'authenticated') {
    console.warn(
      '[startup] SUPABASE_SERVICE_ROLE_KEY is not the service_role secret (JWT role is "' +
        keyRole +
        '"). RLS errors on auth_otps/auth_users will occur. Dashboard → Project Settings → API Keys → service_role.'
    );
  }
  if (keyRole === 'non-jwt-format') {
    console.warn(
      '[startup] SUPABASE_SERVICE_ROLE_KEY is not a 3-part JWT. If you see RLS errors, confirm you copied the server secret (service_role), not the publishable/anon key.'
    );
  }
}
