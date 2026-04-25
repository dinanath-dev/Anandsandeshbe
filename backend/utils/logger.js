import crypto from 'crypto';

function safeString(value, fallback = undefined) {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

export function maskEmail(email) {
  const raw = safeString(email, '')?.trim().toLowerCase() || '';
  const at = raw.indexOf('@');
  if (at <= 1) return '***';
  const name = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (!domain) return `${name[0]}***`;
  return `${name[0]}***@${domain}`;
}

export function createRequestId() {
  return crypto.randomUUID().slice(0, 12);
}

export function getRequestMeta(req) {
  if (!req) return {};
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl || req.url
  };
}

function emit(level, event, payload = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...payload
  });

  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info: (event, payload) => emit('info', event, payload),
  warn: (event, payload) => emit('warn', event, payload),
  error: (event, payload) => emit('error', event, payload)
};
