import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import {
  allocateSubscriberNo,
  deleteOtpRecordByEmail,
  findAuthUserByEmail,
  findOtpRecordByEmail,
  touchAuthLoginByEmail,
  updateAuthUserByEmail,
  updateOtpRecordByEmail,
  upsertAuthUser,
  upsertOtpRecord
} from '../models/authModel.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { getRequestMeta, logger, maskEmail } from '../utils/logger.js';

const requestOtpSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  fullName: z.string().trim().max(120).optional().default(''),
  password: z.string().min(6, 'Password must be at least 6 characters.').max(128).optional(),
  mode: z.enum(['signup', 'login', 'reset']).default('signup')
});

const verifyOtpSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit OTP.')
});

const passwordLoginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Please enter your password.')
});

const resetPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit OTP.'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters.').max(128)
});

function getOtpTtlMs() {
  const minutes = Number(process.env.AUTH_OTP_TTL_MINUTES || 10);
  return Math.max(minutes, 1) * 60 * 1000;
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function getOtpSecret() {
  return process.env.AUTH_OTP_SECRET || process.env.JWT_SECRET;
}

function hashOtp(email, otp) {
  return crypto
    .createHash('sha256')
    .update(`${normalizeEmail(email)}:${otp}:${getOtpSecret()}`)
    .digest('hex');
}

function createOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function scryptAsync(password, salt, keylen = 64) {
  const cost = Number(process.env.AUTH_SCRYPT_N || 16384);
  const blockSize = Number(process.env.AUTH_SCRYPT_R || 8);
  const parallelization = Number(process.env.AUTH_SCRYPT_P || 1);
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keylen,
      { N: cost, r: blockSize, p: parallelization },
      (error, derivedKey) => {
        if (error) return reject(error);
        return resolve(derivedKey);
      }
    );
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)).toString('hex');
  return `${salt}:${hash}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;

  const attemptedHash = (await scryptAsync(password, salt, 64)).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attemptedHash, 'hex'));
}

function createUserToken(record) {
  return jwt.sign(
    {
      role: 'user',
      email: record.email,
      fullName: record.fullName || '',
      subscriberNo: record.subscriberNo ?? null
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.AUTH_JWT_EXPIRES_IN || '7d' }
  );
}

async function resolveSubscriberNo(user, email) {
  if (user?.subscriber_no != null) return Number(user.subscriber_no);
  return allocateSubscriberNo(email);
}

export async function requestOtp(req, res, next) {
  try {
    const parsed = requestOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid auth details.', 400);
    }

    const email = normalizeEmail(parsed.data.email);
    const maskedEmail = maskEmail(email);
    const fullName = parsed.data.fullName.trim();
    const mode = parsed.data.mode;

    logger.info('auth.requestOtp.start', { ...getRequestMeta(req), email: maskedEmail, mode });

    let existingUser;
    try {
      existingUser = await findAuthUserByEmail(email);
    } catch (err) {
      logger.error('auth.requestOtp.userLookup.failed', {
        ...getRequestMeta(req),
        email: maskedEmail,
        message: err?.message
      });
      throw err;
    }

    logger.info('auth.requestOtp.userLookup.ok', {
      ...getRequestMeta(req),
      email: maskedEmail,
      hasUser: Boolean(existingUser)
    });

    if (mode === 'signup') {
      if (!fullName) {
        throw new AppError('Please enter your full name to create your account.', 400);
      }
      if (!parsed.data.password?.trim()) {
        throw new AppError('Please set a password for your account.', 400);
      }
      if (existingUser?.is_verified) {
        throw new AppError('Account already exists. Please log in.', 409);
      }
    }

    if (mode === 'login') {
      if (!existingUser) {
        throw new AppError('No account found with this email. Please sign up first.', 404);
      }
      if (existingUser.is_verified === false) {
        throw new AppError('Please finish verifying your email before signing in.', 403);
      }
    }

    if (mode === 'reset' && !existingUser) {
      throw new AppError('No account found with this email.', 404);
    }

    const otp = createOtp();
    const expiresAt = new Date(Date.now() + getOtpTtlMs()).toISOString();

    await upsertOtpRecord({
      email,
      full_name: fullName || null,
      mode,
      otp_hash: hashOtp(email, otp),
      password_hash: mode === 'signup' ? await hashPassword(parsed.data.password.trim()) : null,
      attempts: 0,
      expires_at: expiresAt,
      last_sent_at: new Date().toISOString()
    });

    logger.info('auth.requestOtp.otpSaved', { ...getRequestMeta(req), email: maskedEmail, mode });

    const mailResult = await sendOtpEmail({ email, otp, fullName, mode });
    const response = {
      message: `A verification code has been sent to ${email}.`,
      expiresAt,
      devMode: !mailResult.delivered
    };

    if (!mailResult.delivered && process.env.NODE_ENV !== 'production') {
      response.devOtp = otp;
      response.message = `SMTP is not configured, so a development OTP was generated for ${email}.`;
    }

    logger.info('auth.requestOtp.done', {
      ...getRequestMeta(req),
      email: maskedEmail,
      mode,
      mailDelivered: mailResult.delivered
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid verification details.', 400);
    }

    const email = normalizeEmail(parsed.data.email);
    const record = await findOtpRecordByEmail(email);

    if (!record || new Date(record.expires_at).getTime() <= Date.now()) {
      await deleteOtpRecordByEmail(email);
      throw new AppError('OTP expired. Please request a new code.', 401);
    }

    if (record.mode === 'reset') {
      throw new AppError('Use the reset password form to enter your code and new password.', 400);
    }

    const attemptedHash = hashOtp(email, parsed.data.otp);
    if (record.otp_hash !== attemptedHash) {
      const attempts = Number(record.attempts || 0) + 1;
      if (attempts >= 5) {
        await deleteOtpRecordByEmail(email);
      } else {
        await updateOtpRecordByEmail(email, {
          attempts
        });
      }
      throw new AppError('Invalid OTP. Please try again.', 401);
    }

    await deleteOtpRecordByEmail(email);
    const existingUser = await findAuthUserByEmail(email);
    const user = await upsertAuthUser({
      email,
      full_name: record.full_name || existingUser?.full_name || null,
      last_auth_mode: record.mode,
      is_verified: true,
      password_hash: record.password_hash || existingUser?.password_hash || null,
      last_login_at: new Date().toISOString()
    });

    const subscriberNo = await resolveSubscriberNo(user, email);

    const token = createUserToken({
      email: user.email,
      fullName: user.full_name || '',
      subscriberNo
    });

    res.json({
      token,
      user: {
        email: user.email,
        fullName: user.full_name || '',
        subscriberNo,
        mode: user.last_auth_mode
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function loginWithPassword(req, res, next) {
  try {
    const parsed = passwordLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid login details.', 400);
    }

    const email = normalizeEmail(parsed.data.email);
    const user = await findAuthUserByEmail(email);
    if (!user) {
      throw new AppError('Invalid email or password.', 401);
    }
    if (user.is_verified === false) {
      throw new AppError('Please verify your email before signing in with a password.', 403);
    }
    if (!user.password_hash || !(await verifyPassword(parsed.data.password, user.password_hash))) {
      throw new AppError('Invalid email or password.', 401);
    }

    const [subscriberNo] = await Promise.all([
      resolveSubscriberNo(user, email),
      touchAuthLoginByEmail(email)
    ]);

    const token = createUserToken({
      email: user.email,
      fullName: user.full_name || '',
      subscriberNo
    });

    res.json({
      token,
      user: {
        email: user.email,
        fullName: user.full_name || '',
        subscriberNo,
        mode: 'login'
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordWithOtp(req, res, next) {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid reset password details.', 400);
    }

    const email = normalizeEmail(parsed.data.email);
    const record = await findOtpRecordByEmail(email);
    if (!record || record.mode !== 'reset' || new Date(record.expires_at).getTime() <= Date.now()) {
      await deleteOtpRecordByEmail(email);
      throw new AppError('OTP expired. Please request a new code.', 401);
    }

    const attemptedHash = hashOtp(email, parsed.data.otp);
    if (record.otp_hash !== attemptedHash) {
      const attempts = Number(record.attempts || 0) + 1;
      if (attempts >= 5) {
        await deleteOtpRecordByEmail(email);
      } else {
        await updateOtpRecordByEmail(email, { attempts });
      }
      throw new AppError('Invalid OTP. Please try again.', 401);
    }

    const user = await findAuthUserByEmail(email);
    if (!user) {
      await deleteOtpRecordByEmail(email);
      throw new AppError('No account found with this email.', 404);
    }

    await updateAuthUserByEmail(email, {
      password_hash: await hashPassword(parsed.data.newPassword),
      last_auth_mode: 'login',
      last_login_at: new Date().toISOString()
    });
    await deleteOtpRecordByEmail(email);

    res.json({ message: 'Password reset successful. Please log in with your new password.' });
  } catch (error) {
    next(error);
  }
}

export async function getCurrentUser(req, res) {
  const user = await findAuthUserByEmail(req.user.email);
  let subscriberNo = user?.subscriber_no ?? req.user.subscriberNo ?? null;
  if (subscriberNo == null && user) {
    try {
      subscriberNo = await allocateSubscriberNo(req.user.email);
    } catch {
      subscriberNo = null;
    }
  }

  res.json({
    user: {
      email: user?.email || req.user.email,
      fullName: user?.full_name || req.user.fullName || '',
      subscriberNo: subscriberNo != null ? Number(subscriberNo) : null
    }
  });
}
