import crypto from 'crypto';
import fs from 'fs';

/** Column order — add this header row once in row 1 of your sheet. */
export const SUBMISSION_SHEET_HEADERS = [
  'SUBSCRIBER_NO',
  'NAME',
  'MOBILE',
  'EMAIL',
  'GENDER',
  'ADDRESS',
  'HOUSE_NO',
  'STREET',
  'AREA',
  'TOWN',
  'DISTRICT',
  'STATE',
  'PIN',
  'REHBAR',
  'ANAND_SANDESH_LANG',
  'SPIRITUAL_BLISS',
  'SUBSCRIPTION_TYPE',
  'TRANSACTION_ID',
  'PAYMENT_STATUS'
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

function getAppendRange(range) {
  const tab = getSheetTabFromRange(range);
  const endCol = indexToColumnName(SUBMISSION_SHEET_HEADERS.length);
  return `${tab}!A:${endCol}`;
}

function normalizeHeader(value) {
  return String(value || '').trim();
}

function valueFromHeader(submission, header, event, nowIso) {
  const s = submission || {};
  const key = normalizeHeader(header).toLowerCase();
  if (!key) return '';
  if (key === 'timestamp') return nowIso;
  if (key === 'event') return event || '';
  const raw = s[key];
  return raw === null || raw === undefined ? '' : String(raw);
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

async function getHeaderRow(accessToken, spreadsheetId, range) {
  const tab = getSheetTabFromRange(range);
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${tab}!1:1`)}`
  );

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || body.error || `Sheets header read HTTP ${res.status}`;
    throw new Error(msg);
  }

  const firstRow = Array.isArray(body.values?.[0]) ? body.values[0] : [];
  return firstRow.map(normalizeHeader).filter(Boolean);
}

function rowFromSubmissionByHeaders(submission, event, headers) {
  const nowIso = new Date().toISOString();
  return headers.map((header) => valueFromHeader(submission, header, event, nowIso));
}

function pickMatchKey(submission) {
  const s = submission || {};
  if (s.subscriber_no !== null && s.subscriber_no !== undefined && String(s.subscriber_no).trim()) {
    return { key: 'subscriber_no', value: String(s.subscriber_no).trim() };
  }
  if (s.transaction_id !== null && s.transaction_id !== undefined && String(s.transaction_id).trim()) {
    return { key: 'transaction_id', value: String(s.transaction_id).trim() };
  }
  return null;
}

async function findRowNumberByKey(accessToken, spreadsheetId, range, key, value) {
  const tab = getSheetTabFromRange(range);
  const readRange = `${tab}!A:Z`;
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(readRange)}`
  );
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || body.error || `Sheets lookup HTTP ${res.status}`;
    throw new Error(msg);
  }

  const rows = Array.isArray(body.values) ? body.values : [];
  if (rows.length === 0) return null;

  const headers = (rows[0] || []).map(normalizeHeader);
  const keyIndex = headers.findIndex((h) => h.toLowerCase() === String(key || '').toLowerCase());
  if (keyIndex < 0) return null;

  for (let i = 1; i < rows.length; i += 1) {
    const rowValue = rows[i]?.[keyIndex];
    if (String(rowValue || '').trim() === String(value || '').trim()) {
      return i + 1;
    }
  }
  return null;
}

async function updateRow(accessToken, spreadsheetId, range, rowNumber, valueRow) {
  const tab = getSheetTabFromRange(range);
  const endCol = indexToColumnName(valueRow.length);
  const rowRange = `${tab}!A${rowNumber}:${endCol}${rowNumber}`;
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rowRange)}`
  );
  url.searchParams.set('valueInputOption', 'USER_ENTERED');

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: rowRange,
      majorDimension: 'ROWS',
      values: [valueRow]
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || body.error || `Sheets update HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
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
  const configuredRange = (process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:Z').trim();
  const range = getAppendRange(configuredRange);
  const credentials = loadServiceAccount();

  if (!spreadsheetId || !credentials?.private_key || !credentials?.client_email) {
    return { skipped: true };
  }

  const accessToken = await getAccessToken(credentials);
  await setHeaderRow(accessToken, spreadsheetId, range);
  const headers = await getHeaderRow(accessToken, spreadsheetId, configuredRange);
  const activeHeaders = headers.length > 0 ? headers : SUBMISSION_SHEET_HEADERS;
  const row = rowFromSubmissionByHeaders(submission, event, activeHeaders);
  const match = pickMatchKey(submission);

  if (event === 'updated' && match) {
    const rowNumber = await findRowNumberByKey(
      accessToken,
      spreadsheetId,
      configuredRange,
      match.key,
      match.value
    );
    if (rowNumber) {
      const updateBody = await updateRow(accessToken, spreadsheetId, configuredRange, rowNumber, row);
      return { skipped: false, updatedRange: updateBody.updatedRange, mode: 'update' };
    }
  }

  const appendBody = await appendValueRows(accessToken, spreadsheetId, range, [row]);
  return { skipped: false, updatedRange: appendBody.updates?.updatedRange, mode: 'append' };
}

/**
 * Appends many rows (e.g. DB backfill). Same columns as live sync; `event` labels each row (e.g. "backfill").
 * Chunks requests to stay within Sheets API limits. Running twice appends duplicates unless the sheet is cleared.
 */
export async function appendSubmissionsBatchToGoogleSheet(submissions, event) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const configuredRange = (process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:Z').trim();
  const range = getAppendRange(configuredRange);
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
  const headers = await getHeaderRow(accessToken, spreadsheetId, configuredRange);
  const activeHeaders = headers.length > 0 ? headers : SUBMISSION_SHEET_HEADERS;
  const rows = list.map((s) => rowFromSubmissionByHeaders(s, event, activeHeaders));
  let lastRange;

  for (let i = 0; i < rows.length; i += APPEND_BATCH_SIZE) {
    const chunk = rows.slice(i, i + APPEND_BATCH_SIZE);
    const errBody = await appendValueRows(accessToken, spreadsheetId, range, chunk);
    lastRange = errBody.updates?.updatedRange ?? lastRange;
  }

  return { skipped: false, appended: rows.length, updatedRange: lastRange };
}
