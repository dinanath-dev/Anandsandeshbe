import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import { getRequestMeta, logger } from '../utils/logger.js';

function stripTokenQuotes(token) {
  let s = String(token || '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  return s.trim();
}

function looksLikeJwt(s) {
  const p = stripTokenQuotes(String(s || '').replace(/^bearer\s+/i, '').trim()).split('.');
  return p.length === 3 && p.every((part) => part.length > 0);
}

/** Accepts `Authorization: Bearer <jwt>` or a raw JWT in `Authorization` (some clients omit the prefix). */
function getBearerToken(req) {
  const headerName = 'authorization';
  const authHeader = String(req.headers[headerName] || req.headers.Authorization || '').trim();
  if (!authHeader) return { token: null, raw: '' };
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = stripTokenQuotes(authHeader.slice(7).trim());
    return { token: token || null, raw: authHeader };
  }
  const rawJwt = stripTokenQuotes(authHeader);
  if (looksLikeJwt(rawJwt)) return { token: rawJwt, raw: authHeader };
  return { token: null, raw: authHeader };
}

function diagnoseAuth(req, raw) {
  return {
    ...getRequestMeta(req),
    hasAuthHeader: Boolean(raw),
    tokenLooksLikeJwt: looksLikeJwt(raw),
    headerPrefix: raw ? raw.slice(0, 7) : null
  };
}

export function requireAdmin(req, _res, next) {
  const { token, raw } = getBearerToken(req);

  if (!token) {
    logger.warn('auth.requireAdmin.missing_token', diagnoseAuth(req, raw));
    next(new AppError('Admin authentication required.', 401));
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('invalid-role');
    req.admin = payload;
    next();
  } catch (err) {
    logger.warn('auth.requireAdmin.invalid', { ...diagnoseAuth(req, raw), reason: err?.name || err?.message });
    next(new AppError('Invalid or expired admin session.', 401));
  }
}

export function requireUser(req, _res, next) {
  const { token, raw } = getBearerToken(req);

  if (!token) {
    logger.warn('auth.requireUser.missing_token', diagnoseAuth(req, raw));
    next(
      new AppError(
        'User authentication required. Send header: Authorization: Bearer <token> (token comes from POST /api/auth/verify-otp or POST /api/auth/login).',
        401
      )
    );
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'user' || !payload.email) {
      logger.warn('auth.requireUser.bad_role', { ...diagnoseAuth(req, raw), role: payload?.role });
      if (payload.role === 'admin') {
        next(new AppError('This endpoint needs a user session token, not an admin token.', 403));
        return;
      }
      next(new AppError('Invalid user session.', 401));
      return;
    }
    req.user = payload;
    next();
  } catch (err) {
    logger.warn('auth.requireUser.verify_failed', {
      ...diagnoseAuth(req, raw),
      reason: err?.name || err?.message
    });
    if (err?.name === 'TokenExpiredError') {
      next(new AppError('Your session expired. Please sign in again.', 401));
      return;
    }
    next(
      new AppError(
        'Invalid user session. Ensure the token was issued by this server and JWT_SECRET has not changed since the token was created.',
        401
      )
    );
  }
}
