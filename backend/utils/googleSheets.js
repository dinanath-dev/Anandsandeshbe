import crypto from 'crypto';
import fs from 'fs';

/** Column order — add this header row once in row 1 of your sheet. */
export const SUBMISSION_SHEET_HEADERS = [

  'subscriber_no',
  'name',
  'mobile',
  'email',
  'gender',
  'address',
  'house_no',
  'street',
  'area',
  'town',
  'district',
  'state',
  'pin',
  'rehbar',
  'anand_sandesh_lang',
  'spiritual_bliss',
  'subscription_type',
  'transaction_id',
  'payment_status'
];

function loadServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (raw?.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (path?.trim()) {
    try {
      return JSON.parse(fs.readFileSync(path.trim(), 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

export function isGoogleSheetsConfigured() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  return Boolean(id && loadServiceAccount());
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signJwtRs256(payload, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const data = `${b64url(header)}.${b64url(payload)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data);
  const sig = sign.sign(privateKeyPem, 'base64url');
  return `${data}.${sig}`;
}

async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = signJwtRs256(
    {
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    },
    credentials.private_key
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error_description || body.error || `token ${res.status}`);
  }
  return body.access_token;
}

/**
 * Diagnostic: can this service account open the spreadsheet? Prints tab titles vs GOOGLE_SHEETS_RANGE.
 * Run: `cd backend && npm run verify:sheets`
 */
export async function verifyGoogleSheetAccess() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const credentials = loadServiceAccount();
  const clientEmail = credentials?.client_email || null;

  if (!spreadsheetId) {
    return { ok: false, clientEmail, error: 'GOOGLE_SHEETS_SPREADSHEET_ID is not set.' };
  }
  if (!credentials?.private_key) {
    return { ok: false, clientEmail, error: 'Service account JSON not loaded (path or GOOGLE_SERVICE_ACCOUNT_JSON).' };
  }

  let accessToken;
  try {
    accessToken = await getAccessToken(credentials);
  } catch (e) {
    return { ok: false, clientEmail, error: `OAuth token failed: ${e.message}` };
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = body.error?.message || `HTTP ${res.status}`;
    const permission =
      res.status === 403 || /permission|does not have permission/i.test(String(msg));
    return {
      ok: false,
      clientEmail,
      spreadsheetId,
      error: msg,
      hint: permission
        ? `In Google Sheets: Share → add ${clientEmail} as Editor. If this file is on a Shared drive, add that service account to the drive or move the file to the owner’s “My Drive”.`
        : undefined
    };
  }

  const tabTitles = (body.sheets || []).map((s) => s.properties?.title).filter(Boolean);
  const range = (process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:Z').trim();
  const rangeTab = range.includes('!') ? range.split('!')[0].replace(/^'|'$/g, '') : 'Sheet1';
  const tabOk = tabTitles.includes(rangeTab);

  return {
    ok: true,
    clientEmail,
    spreadsheetId,
    title: body.properties?.title,
    tabTitles,
    configuredRange: range,
    rangeTabOk: tabOk,
    hint: tabOk
      ? undefined
      : `No tab named "${rangeTab}". Set GOOGLE_SHEETS_RANGE, e.g. ${tabTitles[0] ? `'${tabTitles[0]}!A:Z'` : 'FirstTab!A:Z'}.`
  };
}

function rowFromSubmission(submission, event) {
  const s = submission || {};
  const cell = (v) => (v === null || v === undefined ? '' : String(v));
  const now = new Date().toISOString();
  return [
    now,
    event,
    cell(s.subscriber_no),
    cell(s.name),
    cell(s.mobile),
    cell(s.email),
    cell(s.gender),
    cell(s.address),
    cell(s.house_no),
    cell(s.street),
    cell(s.area),
    cell(s.town),
    cell(s.district),
    cell(s.state),
    cell(s.pin),
    cell(s.rehbar),
    cell(s.anand_sandesh_lang),
    cell(s.spiritual_bliss),
    cell(s.subscription_type),
    cell(s.transaction_id),
    cell(s.payment_status),
    cell(s.screenshot_url)
  ];
}

const APPEND_BATCH_SIZE = 200;

function indexToColumnName(index) {
  let n = Number(index) || 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || 'A';
}

function getSheetTabFromRange(range) {
  const raw = String(range || '').trim();
  if (!raw.includes('!')) return 'Sheet1';
  const tab = raw.split('!')[0].trim();
  return tab.replace(/^'|'$/g, '') || 'Sheet1';
}

async function setHeaderRow(accessToken, spreadsheetId, range) {
  const tab = getSheetTabFromRange(range);
  const endCol = indexToColumnName(SUBMISSION_SHEET_HEADERS.length);
  const headerRange = `${tab}!A1:${endCol}1`;
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(headerRange)}`
  );
  url.searchParams.set('valueInputOption', 'RAW');

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: headerRange,
      majorDimension: 'ROWS',
      values: [SUBMISSION_SHEET_HEADERS]
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || body.error || `Sheets header HTTP ${res.status}`;
    throw new Error(msg);
  }
}

async function appendValueRows(accessToken, spreadsheetId, range, valueRows) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`
  );
  url.searchParams.set('valueInputOption', 'USER_ENTERED');
  url.searchParams.set('insertDataOption', 'INSERT_ROWS');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: valueRows })
  });

  const errBody = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = errBody.error?.message || errBody.error || `Sheets HTTP ${res.status}`;
    const details = errBody.error?.errors?.map((e) => e.message).filter(Boolean).join('; ');
    const base = details ? `${msg} (${details})` : msg;
    const hint =
      /permission|403/i.test(String(base))
        ? ' Open the spreadsheet → Share → add the service account email from your JSON key (client_email) as Editor. Same Google Cloud project must have the Sheets API enabled.'
        : '';
    throw new Error(base + hint);
  }

  return errBody;
}

/**
 * Appends one row mirroring the Supabase subscription form row (anand_sandesh_subscription).
 * Does nothing if GOOGLE_SHEETS_SPREADSHEET_ID / service account are unset.
 */
export async function appendSubmissionToGoogleSheet(submission, event) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const range = (process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:Z').trim();
  const credentials = loadServiceAccount();

  if (!spreadsheetId || !credentials?.private_key || !credentials?.client_email) {
    return { skipped: true };
  }

  const accessToken = await getAccessToken(credentials);
  await setHeaderRow(accessToken, spreadsheetId, range);
  const errBody = await appendValueRows(accessToken, spreadsheetId, range, [
    rowFromSubmission(submission, event)
  ]);

  return { skipped: false, updatedRange: errBody.updates?.updatedRange };
}

/**
 * Appends many rows (e.g. DB backfill). Same columns as live sync; `event` labels each row (e.g. "backfill").
 * Chunks requests to stay within Sheets API limits. Running twice appends duplicates unless the sheet is cleared.
 */
export async function appendSubmissionsBatchToGoogleSheet(submissions, event) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const range = (process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:Z').trim();
  const credentials = loadServiceAccount();

  if (!spreadsheetId || !credentials?.private_key || !credentials?.client_email) {
    return { skipped: true, appended: 0 };
  }

  const list = Array.isArray(submissions) ? submissions : [];
  if (list.length === 0) {
    return { skipped: false, appended: 0 };
  }

  const accessToken = await getAccessToken(credentials);
  await setHeaderRow(accessToken, spreadsheetId, range);
  const rows = list.map((s) => rowFromSubmission(s, event));
  let lastRange;

  for (let i = 0; i < rows.length; i += APPEND_BATCH_SIZE) {
    const chunk = rows.slice(i, i + APPEND_BATCH_SIZE);
    const errBody = await appendValueRows(accessToken, spreadsheetId, range, chunk);
    lastRange = errBody.updates?.updatedRange ?? lastRange;
  }

  return { skipped: false, appended: rows.length, updatedRange: lastRange };
}
