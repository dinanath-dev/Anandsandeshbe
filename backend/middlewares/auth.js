import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

export function requireAdmin(req, _res, next) {
  const token = getBearerToken(req);

  if (!token) {
    next(new AppError('Admin authentication required.', 401));
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('invalid-role');
    req.admin = payload;
    next();
  } catch {
    next(new AppError('Invalid or expired admin session.', 401));
  }
}

export function requireUser(req, _res, next) {
  const token = getBearerToken(req);

  if (!token) {
    next(new AppError('User authentication required.', 401));
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'user' || !payload.email) throw new Error('invalid-role');
    req.user = payload;
    next();
  } catch {
    next(new AppError('Invalid or expired user session.', 401));
  }
}
