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
  gold: '#c9a43a',
  goldBright: '#e8c547',
  bgDeep: '#060d1a',
  bgMid: '#0a1628',
  text: '#0f1a2e',
  muted: '#4a5b72',
  surface: '#f8fafc',
  border: 'rgba(13, 45, 127, 0.14)',
  /* Dark card — matches auth / mobile OTP look */
  cardBg: '#101820',
  cardCodeBg: '#182433',
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
 * Same overlay as frontend on bg.avif.
 * @param {{ backgroundCid?: string | null }} [opts] — if set, uses embedded CID image (bg.avif) behind the gradient.
 */
function getOuterBackgroundCss({ backgroundCid } = {}) {
  const overlay =
    'linear-gradient(180deg, rgba(6, 13, 26, 0.25) 0%, rgba(6, 13, 26, 0.08) 45%, rgba(6, 13, 26, 0.2) 100%)';
  const photoFallback = `linear-gradient(165deg,${BRAND.bgDeep} 0%,${BRAND.bgMid} 42%,#152a48 72%,${BRAND.navy} 118%)`;
  const base =
    'background-size:cover,cover;background-position:center,center;background-repeat:no-repeat,no-repeat;min-height:100%;';

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

  /* Table layout + inline styles for broad email client support; palette matches site bg.avif / auth theme */
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bgMid};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${getOuterBackgroundCss({ backgroundCid })}">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:separate;">
          <tr>
            <td style="height:4px;border-radius:4px 4px 0 0;background:linear-gradient(90deg,${BRAND.goldBright} 0%,${BRAND.navy} 42%,${BRAND.sky} 100%);"></td>
          </tr>
          <tr>
            <td style="background-color:${BRAND.cardBg};border-radius:0 0 22px 22px;border:1px solid ${BRAND.cardBorder};border-top:none;box-shadow:0 28px 56px rgba(0,0,0,0.45);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:28px 28px 8px 28px;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${BRAND.mutedOnDark};">
                      ${escapeHtml(BRAND.name)} · ${escapeHtml(BRAND.tagline)}
                    </p>
                    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:800;color:${BRAND.textOnDark};">
                      ${escapeHtml(headline)}
                    </h1>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:${BRAND.textOnDark};">
                      Hello ${safeName},<br><br><span style="color:${BRAND.mutedOnDark};">${escapeHtml(lead)}</span>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 24px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:16px;background-color:${BRAND.cardCodeBg};border:1px solid ${BRAND.cardBorder};">
                      <tr>
                        <td align="center" style="padding:22px 16px;">
                          <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.labelAccent};">
                            Your code
                          </p>
                          <p style="margin:0;font-family:'Consolas','Courier New',monospace;font-size:32px;font-weight:800;letter-spacing:0.38em;color:#ffffff;">
                            ${otpDigits}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px 28px;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    <p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:${BRAND.mutedOnDark};">
                      This code is tied to <strong style="color:${BRAND.textOnDark};">${safeEmail}</strong>. If you did not request it, you can ignore this message.
                    </p>
                    <p style="margin:0;padding-top:16px;border-top:1px solid ${BRAND.cardBorder};font-size:12px;line-height:1.6;color:${BRAND.mutedOnDark};">
                      Anand Sandesh Karyale, Shri Anandpur Dham, Post Office Shri Anandpur — <span style="font-weight:700;color:${BRAND.textOnDark};">473331</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 8px 0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;color:${BRAND.labelAccent};">
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

function formatMoneyLine(amountPaise, currency) {
  if (amountPaise == null || amountPaise === '') return null;
  const n = Number(amountPaise);
  if (!Number.isFinite(n)) return null;
  const major = n / 100;
  const c = (currency || 'INR').toUpperCase();
  if (c === 'INR') return `₹${major.toFixed(2)}`;
  return `${major.toFixed(2)} ${c}`;
}

function receiptDetailRow(label, value) {
  if (value == null || String(value).trim() === '') return '';
  return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.cardBorder};font-size:13px;color:${BRAND.mutedOnDark};font-family:'Segoe UI',Roboto,Arial,sans-serif;">${escapeHtml(label)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.cardBorder};font-size:13px;font-weight:600;color:${BRAND.textOnDark};text-align:right;word-break:break-word;font-family:'Consolas','Courier New',monospace;">${escapeHtml(String(value))}</td>
  </tr>`;
}

function buildPaymentReceiptHtml({
  email,
  fullName,
  subscriberNo,
  planId,
  razorpayPaymentId,
  razorpaySubscriptionId,
  amountPaise,
  currency,
  paidAtIso,
  backgroundCid
}) {
  const safeName = escapeHtml(fullName?.trim() || email.split('@')[0] || 'there');
  const safeEmail = escapeHtml(email);
  const amountLine = formatMoneyLine(amountPaise, currency);
  const paidLabel = paidAtIso ? new Date(paidAtIso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  const rows = [
    receiptDetailRow('Reference ID', subscriberNo != null ? String(subscriberNo) : ''),
    receiptDetailRow('Email', email),
    receiptDetailRow('Plan ID', planId),
    receiptDetailRow('Razorpay payment ID', razorpayPaymentId),
    receiptDetailRow('Razorpay subscription ID', razorpaySubscriptionId),
    receiptDetailRow('Amount', amountLine || ''),
    receiptDetailRow('Date', paidLabel || '')
  ].join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment receipt — ${escapeHtml(BRAND.name)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bgMid};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${getOuterBackgroundCss({ backgroundCid })}">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:separate;">
          <tr>
            <td style="height:4px;border-radius:4px 4px 0 0;background:linear-gradient(90deg,${BRAND.goldBright} 0%,${BRAND.navy} 42%,${BRAND.sky} 100%);"></td>
          </tr>
          <tr>
            <td style="background-color:${BRAND.cardBg};border-radius:0 0 22px 22px;border:1px solid ${BRAND.cardBorder};border-top:none;box-shadow:0 28px 56px rgba(0,0,0,0.45);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:28px 28px 12px 28px;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${BRAND.mutedOnDark};">
                      ${escapeHtml(BRAND.name)} · Payment receipt
                    </p>
                    <h1 style="margin:0 0 14px;font-size:26px;line-height:1.2;font-weight:800;color:${BRAND.textOnDark};">
                      Thank you for your payment
                    </h1>
                    <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:${BRAND.textOnDark};">
                      Hello ${safeName},<br><br>
                      <span style="color:${BRAND.mutedOnDark};">Your subscription payment was received and verified. Keep this email for your records.</span>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px 24px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:16px;background-color:${BRAND.cardCodeBg};border:1px solid ${BRAND.cardBorder};border-collapse:collapse;">
                      ${rows}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px 28px;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    <p style="margin:0;padding-top:12px;border-top:1px solid ${BRAND.cardBorder};font-size:12px;line-height:1.6;color:${BRAND.mutedOnDark};">
                      Registered account: <strong style="color:${BRAND.textOnDark};">${safeEmail}</strong><br><br>
                      Anand Sandesh Karyale, Shri Anandpur Dham, Post Office Shri Anandpur — <span style="font-weight:700;color:${BRAND.textOnDark};">473331</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 8px 0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;color:${BRAND.labelAccent};">
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

function buildPaymentReceiptText({
  email,
  fullName,
  subscriberNo,
  planId,
  razorpayPaymentId,
  razorpaySubscriptionId,
  amountPaise,
  currency,
  paidAtIso
}) {
  const name = fullName?.trim() || email.split('@')[0] || 'there';
  const amountLine = formatMoneyLine(amountPaise, currency);
  const lines = [
    `Payment receipt — ${BRAND.name}`,
    '',
    `Hello ${name},`,
    '',
    'Your subscription payment was received and verified.',
    '',
    `Reference ID: ${subscriberNo ?? ''}`,
    `Email: ${email}`,
    `Plan ID: ${planId ?? ''}`,
    `Razorpay payment ID: ${razorpayPaymentId ?? ''}`,
    `Razorpay subscription ID: ${razorpaySubscriptionId ?? ''}`
  ];
  if (amountLine) lines.push(`Amount: ${amountLine}`);
  if (paidAtIso) lines.push(`Date: ${new Date(paidAtIso).toISOString()}`);
  lines.push('', 'Anand Sandesh Karyale, Shri Anandpur Dham, Post Office Shri Anandpur — 473331');
  return lines.join('\n');
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
 * Sends payment receipt after successful Razorpay verification. Does not throw (logs on failure).
 */
export async function sendPaymentReceiptEmail({
  to,
  fullName,
  subscriberNo,
  planId,
  razorpayPaymentId,
  razorpaySubscriptionId,
  amountPaise,
  currency,
  paidAtIso
}) {
  const email = String(to || '').trim().toLowerCase();
  if (!email) {
    logger.warn('mail.receipt.skip', { reason: 'no_email' });
    return { delivered: false };
  }

  const activeTransporter = getTransporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const subject = `Payment receipt — ${BRAND.name}`;
  const maskedTo = maskEmail(email);
  const bg = resolveBgAvifAttachment();
  const backgroundCid = bg?.cid ?? null;
  const attachments = nodemailerAttachmentsFromBg(bg);

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
      text: buildPaymentReceiptText({
        email,
        fullName,
        subscriberNo,
        planId,
        razorpayPaymentId,
        razorpaySubscriptionId,
        amountPaise,
        currency,
        paidAtIso
      }),
      html: buildPaymentReceiptHtml({
        email,
        fullName,
        subscriberNo,
        planId,
        razorpayPaymentId,
        razorpaySubscriptionId,
        amountPaise,
        currency,
        paidAtIso,
        backgroundCid
      }),
      attachments
    });
    const elapsedMs = Date.now() - startedAt;
    logger.info('mail.receipt.sent', {
      to: maskedTo,
      elapsedMs,
      messageId: info.messageId || null,
      bgAvifAttached: Boolean(bg)
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
