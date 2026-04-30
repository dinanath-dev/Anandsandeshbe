import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { AppError } from './AppError.js';
import { logger, maskEmail } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** CID reference for inline `bg.avif` (same artwork as site / OTP emails). */
const MAIL_BG_CID = 'anand-sandesh-bg-avif';

function getTransportConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return {
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
    auth: { user, pass }
  };
}

let transporter;
const SLOW_EMAIL_MS = 4000;

function getTransporter() {
  if (transporter) return transporter;

  const config = getTransportConfig();
  if (!config) return null;

  transporter = nodemailer.createTransport(config);
  return transporter;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BRAND = {
  name: 'Anand Sandesh',
  tagline: 'Subscription portal',
  navy: '#0d2d7f',
  royal: '#1e4a9e',
  sky: '#3b6fb8',
  skyLight: '#cfe1f7',
  gold: '#c9a43a',
  goldBright: '#e8c547',
  goldSoft: '#f6e5a3',
  bgDeep: '#060d1a',
  bgMid: '#0a1628',
  text: '#0f1a2e',
  muted: '#4a5b72',
  surface: '#f8fafc',
  border: 'rgba(13, 45, 127, 0.14)',
  /* Bright "ivory" card — meant to feel sunlit and complement bg.avif's gold/sky tones */
  lightOuterTop: '#fdf6e3',
  lightOuterMid: '#f4dca0',
  lightOuterBottom: '#cfe1f7',
  lightCardBg: '#ffffff',
  lightCardBorder: 'rgba(13, 45, 127, 0.16)',
  lightCardShadow: 'rgba(13, 45, 127, 0.16)',
  lightCodeBoxBg: '#fff8e1',
  lightCodeBoxBorder: 'rgba(201, 164, 58, 0.45)',
  lightTextStrong: '#0d2d7f',
  lightTextBody: '#1f2a44',
  lightTextMuted: '#5a6577',
  lightLabelAccent: '#9c7c1f',
  /* Dark card — kept for non-OTP receipt/legacy use */
  cardBg: '#101820',
  cardBorder: 'rgba(59, 111, 184, 0.28)',
  textOnDark: '#f1f5f9',
  mutedOnDark: '#94a3b8',
  labelAccent: '#7eb8ea'
};

/**
 * Resolve `bg.avif` for inline CID attachment (preferred for matching the site background).
 * Search order: MAIL_BG_AVIF_PATH → backend/bg.avif → backend/assets/bg.avif
 */
export function resolveBgAvifAttachment() {
  const envPath = process.env.MAIL_BG_AVIF_PATH?.trim();
  const candidates = [
    envPath,
    path.join(__dirname, '..', 'bg.avif'),
    path.join(__dirname, '..', 'assets', 'bg.avif')
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      const resolved = path.resolve(p);
      if (fs.existsSync(resolved)) {
        return { path: resolved, cid: MAIL_BG_CID };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function nodemailerAttachmentsFromBg(bg) {
  if (!bg) return [];
  return [
    {
      filename: 'bg.avif',
      path: bg.path,
      cid: bg.cid,
      contentType: 'image/avif'
    }
  ];
}

/**
 * Outer page background. Supports a dark variant (legacy) and a bright/light variant for OTP emails.
 * @param {{ backgroundCid?: string | null, theme?: 'dark' | 'light' }} [opts]
 */
function getOuterBackgroundCss({ backgroundCid, theme = 'dark' } = {}) {
  const base =
    'background-size:cover,cover;background-position:center,center;background-repeat:no-repeat,no-repeat;min-height:100%;';

  if (theme === 'light') {
    /* Soft cream → warm gold → sky-blue gradient that picks up bg.avif's golden/sky tones. */
    const overlay =
      'linear-gradient(180deg, rgba(255, 248, 225, 0.72) 0%, rgba(255, 248, 225, 0.38) 45%, rgba(207, 225, 247, 0.62) 100%)';
    const photoFallback = `linear-gradient(165deg,${BRAND.lightOuterTop} 0%,${BRAND.lightOuterMid} 50%,${BRAND.lightOuterBottom} 100%)`;

    if (backgroundCid) {
      return `background-color:${BRAND.lightOuterTop};background-image:${overlay}, url(cid:${backgroundCid});${base}`;
    }
    const rawL = process.env.MAIL_BG_IMAGE_URL?.trim();
    const urlL = rawL && /^https:\/\//i.test(rawL) && !/['"\\]/.test(rawL) ? rawL : null;
    if (urlL) {
      return `background-color:${BRAND.lightOuterTop};background-image:${overlay}, url(${urlL});${base}`;
    }
    return `background-color:${BRAND.lightOuterTop};background-image:${overlay}, ${photoFallback};${base}`;
  }

  const overlay =
    'linear-gradient(180deg, rgba(6, 13, 26, 0.25) 0%, rgba(6, 13, 26, 0.08) 45%, rgba(6, 13, 26, 0.2) 100%)';
  const photoFallback = `linear-gradient(165deg,${BRAND.bgDeep} 0%,${BRAND.bgMid} 42%,#152a48 72%,${BRAND.navy} 118%)`;

  if (backgroundCid) {
    return `background-color:${BRAND.bgMid};background-image:${overlay}, url(cid:${backgroundCid});${base}`;
  }

  const raw = process.env.MAIL_BG_IMAGE_URL?.trim();
  const url =
    raw && /^https:\/\//i.test(raw) && !/['"\\]/.test(raw) ? raw : null;
  if (url) {
    return `background-color:${BRAND.bgMid};background-image:${overlay}, url(${url});${base}`;
  }
  return `background-color:${BRAND.bgMid};background-image:${overlay}, ${photoFallback};${base}`;
}

function otpCopyForMode(mode) {
  if (mode === 'login') {
    return {
      subject: `Your sign-in code — ${BRAND.name}`,
      headline: 'Sign in to your account',
      lead: 'Use this one-time code to finish signing in. It expires shortly.'
    };
  }
  if (mode === 'reset') {
    return {
      subject: `Reset your password — ${BRAND.name}`,
      headline: 'Password reset code',
      lead: 'Use this code on the reset-password screen to choose a new password.'
    };
  }
  return {
    subject: `Verify your email — ${BRAND.name}`,
    headline: 'Complete your sign-up',
    lead: 'Use this one-time code to verify your email and activate your subscription access.'
  };
}

function buildOtpHtml({ email, otp, fullName, mode, backgroundCid }) {
  const safeName = escapeHtml(fullName?.trim() || email.split('@')[0] || 'there');
  const safeEmail = escapeHtml(email);
  const { headline, lead } = otpCopyForMode(mode);

  const otpDigits = escapeHtml(otp);

  /* Bright "ivory + gold + sky" palette — picks up the bg.avif theme without going dark navy. */
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.lightOuterTop};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${getOuterBackgroundCss({ backgroundCid, theme: 'light' })}">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:separate;">
          <tr>
            <td style="height:5px;border-radius:5px 5px 0 0;background:linear-gradient(90deg,${BRAND.goldBright} 0%,${BRAND.gold} 42%,${BRAND.sky} 100%);"></td>
          </tr>
          <tr>
            <td style="background-color:${BRAND.lightCardBg};border-radius:0 0 22px 22px;border:1px solid ${BRAND.lightCardBorder};border-top:none;box-shadow:0 24px 48px ${BRAND.lightCardShadow};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:28px 28px 8px 28px;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${BRAND.lightLabelAccent};">
                      ${escapeHtml(BRAND.name)} · ${escapeHtml(BRAND.tagline)}
                    </p>
                    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:800;color:${BRAND.lightTextStrong};">
                      ${escapeHtml(headline)}
                    </h1>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:${BRAND.lightTextBody};">
                      Hello ${safeName},<br><br><span style="color:${BRAND.lightTextMuted};">${escapeHtml(lead)}</span>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 24px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:18px;background-color:${BRAND.lightCodeBoxBg};border:1px solid ${BRAND.lightCodeBoxBorder};">
                      <tr>
                        <td align="center" style="padding:24px 16px;">
                          <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND.lightLabelAccent};">
                            Your code
                          </p>
                          <p style="margin:0;font-family:'Consolas','Courier New',monospace;font-size:34px;font-weight:800;letter-spacing:0.38em;color:${BRAND.lightTextStrong};">
                            ${otpDigits}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px 28px;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    <p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:${BRAND.lightTextMuted};">
                      This code is tied to <strong style="color:${BRAND.lightTextStrong};">${safeEmail}</strong>. If you did not request it, you can ignore this message.
                    </p>
                    <p style="margin:0;padding-top:16px;border-top:1px solid ${BRAND.lightCardBorder};font-size:12px;line-height:1.6;color:${BRAND.lightTextMuted};">
                      Anand Sandesh Karyale, Shri Anandpur Dham, Post Office Shri Anandpur — <span style="font-weight:700;color:${BRAND.lightTextStrong};">473331</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 8px 0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;color:${BRAND.lightLabelAccent};">
              Sent via ${escapeHtml(BRAND.name)} subscription services
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOtpText({ email, otp, fullName, mode }) {
  const { headline, lead } = otpCopyForMode(mode);
  const name = fullName?.trim() || email.split('@')[0] || 'there';
  return [
    `${headline} — ${BRAND.name}`,
    '',
    `Hello ${name},`,
    lead,
    '',
    `Your code: ${otp}`,
    '',
    `This code is for ${email}.`,
    '',
    'If you did not request this, you can ignore this email.',
    '',
    'Anand Sandesh Karyale, Shri Anandpur Dham, Post Office Shri Anandpur — 473331'
  ].join('\n');
}

/** Split paise into ₹ (rupees) + paise pair for the bill's two-column "Amount" cell. */
function formatAmountSplit(amountPaise) {
  if (amountPaise == null || amountPaise === '') return { rs: '', ps: '', display: '' };
  const n = Number(amountPaise);
  if (!Number.isFinite(n)) return { rs: '', ps: '', display: '' };
  const safe = Math.max(0, Math.round(n));
  const rs = Math.floor(safe / 100);
  const ps = (safe % 100).toString().padStart(2, '0');
  return { rs: String(rs), ps, display: `${rs}.${ps}` };
}

/** dd/mm/yyyy in IST — matches how the printed bill writes the date. */
function formatBillDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  const valid = !Number.isNaN(d.getTime()) ? d : new Date();
  const day = String(valid.getDate()).padStart(2, '0');
  const month = String(valid.getMonth() + 1).padStart(2, '0');
  const year = valid.getFullYear();
  return `${day}/${month}/${year}`;
}

function composeBillAddress(submission = {}) {
  const direct = String(submission.address || '').trim();
  if (direct) return direct;
  return [
    submission.house_no,
    submission.street,
    submission.area,
    submission.town,
    submission.district,
    submission.state,
    submission.pin
  ]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

function buildBillDescription(submission = {}) {
  const parts = ['Anand Sandesh subscription'];
  const lang = String(submission.anand_sandesh_lang || '').trim();
  if (lang) parts.push(`(${lang})`);
  const subType = String(submission.subscription_type || '').trim();
  if (subType) parts.push(`— ${subType}`);
  return parts.join(' ');
}

function billUnderlineCell(value, { minWidth = 180 } = {}) {
  const safe = escapeHtml(value || '\u00A0');
  return `<span style="display:inline-block;border-bottom:1px solid #000;min-width:${minWidth}px;margin-left:6px;padding:0 4px 2px;font-weight:600;">${safe}</span>`;
}

function buildPaymentReceiptHtml({
  submission,
  paidAtIso,
  amountPaise,
  pan
}) {
  const name = String(submission?.name || '').trim();
  const email = String(submission?.email || '').trim();
  const phone = String(submission?.mobile || '').trim();
  const slNo = submission?.subscriber_no != null ? String(submission.subscriber_no) : (submission?.id != null ? String(submission.id) : '');
  const dateStr = formatBillDate(paidAtIso);
  const description = buildBillDescription(submission);
  const address = composeBillAddress(submission);
  const { rs, ps, display: rateDisplay } = formatAmountSplit(amountPaise);

  const blankRowsCount = 4;
  const blankRow = `
    <tr>
      <td style="border:1px solid #000;padding:14px 8px;">&nbsp;</td>
      <td style="border:1px solid #000;padding:14px 8px;">&nbsp;</td>
      <td style="border:1px solid #000;padding:14px 8px;">&nbsp;</td>
      <td style="border:1px solid #000;padding:14px 8px;">&nbsp;</td>
      <td style="border:1px solid #000;padding:14px 8px;">&nbsp;</td>
    </tr>`;
  const blankRows = Array.from({ length: blankRowsCount }).map(() => blankRow).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bill — Anand Sandesh Karyalay</title>
</head>
<body style="margin:0;padding:0;background:#eef0f3;color:#000;font-family:'Times New Roman',Times,Georgia,serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef0f3;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:680px;max-width:96%;background:#ffffff;border:1px solid #1a1a1a;padding:30px 34px;">
          <tr>
            <td>
              <p style="text-align:center;font-weight:bold;font-size:18px;margin:0 0 22px;letter-spacing:0.2px;">
                Shri Paramhans Advait Mat Publication Society
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;line-height:1.5;">
                <tr>
                  <td style="padding:6px 0;width:50%;vertical-align:top;">
                    <span>PAN No.</span>${billUnderlineCell(pan, { minWidth: 200 })}
                  </td>
                  <td style="padding:6px 0;width:50%;vertical-align:top;">
                    <span>Phone No.</span>${billUnderlineCell(phone, { minWidth: 200 })}
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;vertical-align:top;">&nbsp;</td>
                  <td style="padding:6px 0;vertical-align:top;">
                    <span>Email Id :</span>${billUnderlineCell(email, { minWidth: 200 })}
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;vertical-align:top;">
                    <span>Sl. No.</span>${billUnderlineCell(slNo, { minWidth: 200 })}
                  </td>
                  <td style="padding:6px 0;vertical-align:top;">
                    <span>Date :</span>${billUnderlineCell(dateStr, { minWidth: 200 })}
                  </td>
                </tr>
              </table>

              <p style="text-align:center;font-weight:bold;font-size:17px;margin:24px 0 6px;letter-spacing:0.6px;">
                ANAND SANDESH KARYALAY
              </p>
              <p style="text-align:center;font-weight:bold;font-size:13px;margin:0 0 14px;">
                Regd Office : 16/198, Joshi Nagar, Faiz Road, Karol Bagh, Delhi &ndash; 110 005
              </p>
              <p style="text-align:center;font-weight:bold;font-size:16px;margin:14px 0 18px;letter-spacing:1px;">
                BILL
              </p>

              <p style="font-size:14px;margin:10px 0;">
                <span>Name :</span>${billUnderlineCell(name, { minWidth: 540 })}
              </p>
              <p style="font-size:14px;margin:10px 0;">
                <span>Address :</span>${billUnderlineCell(address, { minWidth: 520 })}
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:14px;margin-top:18px;">
                <thead>
                  <tr>
                    <th rowspan="2" style="border:1px solid #000;padding:8px;width:54px;text-align:center;font-weight:bold;">Qty.</th>
                    <th rowspan="2" style="border:1px solid #000;padding:8px;text-align:center;font-weight:bold;">DESCRIPTION</th>
                    <th rowspan="2" style="border:1px solid #000;padding:8px;width:90px;text-align:center;font-weight:bold;">RATE</th>
                    <th colspan="2" style="border:1px solid #000;padding:6px;text-align:center;font-weight:bold;">Amount</th>
                  </tr>
                  <tr>
                    <th style="border:1px solid #000;padding:6px;width:70px;text-align:center;font-weight:bold;">Rs.</th>
                    <th style="border:1px solid #000;padding:6px;width:55px;text-align:center;font-weight:bold;">Ps.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="border:1px solid #000;padding:10px 8px;text-align:center;">1</td>
                    <td style="border:1px solid #000;padding:10px 12px;">${escapeHtml(description)}</td>
                    <td style="border:1px solid #000;padding:10px 8px;text-align:right;">${escapeHtml(rateDisplay || '')}</td>
                    <td style="border:1px solid #000;padding:10px 8px;text-align:right;">${escapeHtml(rs || '')}</td>
                    <td style="border:1px solid #000;padding:10px 8px;text-align:right;">${escapeHtml(ps || '')}</td>
                  </tr>
                  ${blankRows}
                  <tr>
                    <td style="border:1px solid #000;padding:8px;font-size:12px;">E &amp; O E</td>
                    <td style="border:1px solid #000;padding:8px;text-align:center;font-weight:bold;letter-spacing:0.4px;">TOTAL</td>
                    <td style="border:1px solid #000;padding:8px;">&nbsp;</td>
                    <td style="border:1px solid #000;padding:8px;text-align:right;font-weight:bold;">${escapeHtml(rs || '')}</td>
                    <td style="border:1px solid #000;padding:8px;text-align:right;font-weight:bold;">${escapeHtml(ps || '')}</td>
                  </tr>
                </tbody>
              </table>

              <p style="text-align:right;margin:48px 16px 8px 0;font-size:14px;">Signature</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPaymentReceiptText({
  submission,
  paidAtIso,
  amountPaise,
  pan
}) {
  const name = String(submission?.name || '').trim();
  const email = String(submission?.email || '').trim();
  const phone = String(submission?.mobile || '').trim();
  const slNo = submission?.subscriber_no != null ? String(submission.subscriber_no) : (submission?.id != null ? String(submission.id) : '');
  const dateStr = formatBillDate(paidAtIso);
  const description = buildBillDescription(submission);
  const address = composeBillAddress(submission);
  const { rs, ps, display: rateDisplay } = formatAmountSplit(amountPaise);
  const dash = (v) => (v && String(v).trim() ? String(v).trim() : '_______________');

  return [
    'Shri Paramhans Advait Mat Publication Society',
    '',
    `PAN No. ${dash(pan)}            Phone No. ${dash(phone)}`,
    `Sl. No. ${dash(slNo)}            Email Id : ${dash(email)}`,
    `                                  Date : ${dash(dateStr)}`,
    '',
    'ANAND SANDESH KARYALAY',
    'Regd Office : 16/198, Joshi Nagar, Faiz Road, Karol Bagh, Delhi – 110 005',
    '',
    'BILL',
    '',
    `Name    : ${dash(name)}`,
    `Address : ${dash(address)}`,
    '',
    'Qty.  DESCRIPTION                                           RATE      Amount Rs.   Ps.',
    `1     ${description.padEnd(50, ' ')} ${(rateDisplay || '').padStart(8, ' ')}  ${(rs || '').padStart(8, ' ')}    ${(ps || '').padStart(2, ' ')}`,
    '',
    `E & O E                                              TOTAL    ${(rs || '').padStart(8, ' ')}    ${(ps || '').padStart(2, ' ')}`,
    '',
    '                                                                          Signature'
  ].join('\n');
}

export function getOtpEmailSubject(mode) {
  return otpCopyForMode(mode).subject;
}

export async function sendOtpEmail({ email, otp, fullName, mode = 'signup' }) {
  const activeTransporter = getTransporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const subject = getOtpEmailSubject(mode);
  const smtpHost = process.env.SMTP_HOST || '';
  const smtpPort = String(process.env.SMTP_PORT || 587);
  const maskedTo = maskEmail(email);

  const bg = resolveBgAvifAttachment();
  const backgroundCid = bg?.cid ?? null;
  const attachments = nodemailerAttachmentsFromBg(bg);

  if (!activeTransporter || !from) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('mail.otp.missingConfig', { smtpConfigured: Boolean(smtpHost), hasFrom: Boolean(from) });
      throw new AppError('Email service is not configured.', 500);
    }

    logger.warn('mail.otp.devFallback', { to: maskedTo, mode });
    return { delivered: false };
  }

  logger.info('mail.otp.sending', { to: maskedTo, mode, smtpHost: Boolean(smtpHost), smtpPort });

  try {
    const startedAt = Date.now();
    const info = await activeTransporter.sendMail({
      from,
      to: email,
      subject,
      text: buildOtpText({ email, otp, fullName, mode }),
      html: buildOtpHtml({ email, otp, fullName, mode, backgroundCid }),
      attachments
    });
    const elapsedMs = Date.now() - startedAt;

    logger.info('mail.otp.sent', { to: maskedTo, elapsedMs, messageId: info.messageId || null, bgAvifAttached: Boolean(bg) });
    if (elapsedMs >= SLOW_EMAIL_MS) {
      logger.warn('mail.otp.slow', { to: maskedTo, elapsedMs });
    }
    return { delivered: true };
  } catch (err) {
    logger.error('mail.otp.failed', {
      to: maskedTo,
      smtpHost: Boolean(smtpHost),
      smtpPort,
      message: err?.message,
      code: err?.code,
      command: err?.command,
      response: err?.response
    });
    throw new AppError('Could not send verification email. Check SMTP settings and logs.', 500);
  }
}

/**
 * Sends payment-success bill email modeled on the printed Anand Sandesh Karyalay bill.
 * Pass `submission` as the full subscription row so name/address/phone/email get rendered.
 * Does not throw on send errors (logs and returns).
 */
export async function sendPaymentReceiptEmail({
  to,
  submission = {},
  amountPaise,
  paidAtIso
}) {
  const email = String(to || submission?.email || '').trim().toLowerCase();
  if (!email) {
    logger.warn('mail.receipt.skip', { reason: 'no_email' });
    return { delivered: false };
  }

  const activeTransporter = getTransporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const subject = 'Bill — Anand Sandesh Karyalay';
  const maskedTo = maskEmail(email);
  const pan = String(process.env.MAIL_BILL_PAN || '').trim();

  if (!activeTransporter || !from) {
    logger.warn('mail.receipt.skip', { to: maskedTo, reason: 'smtp_not_configured' });
    return { delivered: false };
  }

  try {
    const startedAt = Date.now();
    const info = await activeTransporter.sendMail({
      from,
      to: email,
      subject,
      text: buildPaymentReceiptText({ submission, paidAtIso, amountPaise, pan }),
      html: buildPaymentReceiptHtml({ submission, paidAtIso, amountPaise, pan })
    });
    const elapsedMs = Date.now() - startedAt;
    logger.info('mail.receipt.sent', {
      to: maskedTo,
      elapsedMs,
      messageId: info.messageId || null
    });
    return { delivered: true };
  } catch (err) {
    logger.error('mail.receipt.failed', {
      to: maskedTo,
      message: err?.message,
      code: err?.code
    });
    return { delivered: false };
  }
}
