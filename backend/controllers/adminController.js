import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { listSubmissions, updateSubmission } from '../models/submissionModel.js';
import { AppError } from '../utils/AppError.js';
import {
  appendSubmissionToGoogleSheet,
  appendSubmissionsBatchToGoogleSheet,
  isGoogleSheetsConfigured
} from '../utils/googleSheets.js';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid admin email.'),
  password: z.string().min(1, 'Password is required.')
});

function normalizeAdminEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

export async function adminLogin(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid login.', 401);
    }

    const expectedEmail = normalizeAdminEmail(process.env.ADMIN_EMAIL || '');
    const givenEmail = normalizeAdminEmail(parsed.data.email);

    if (!expectedEmail || givenEmail !== expectedEmail || parsed.data.password !== process.env.ADMIN_PASSWORD) {
      throw new AppError('Invalid admin email or password.', 401);
    }

    const token = jwt.sign({ role: 'admin', email: givenEmail }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (error) {
    next(error);
  }
}

export async function getSubmissions(req, res, next) {
  try {
    const status = ['pending', 'verified'].includes(req.query.status) ? req.query.status : undefined;
    const submissions = await listSubmissions(status);
    res.json({ submissions });
  } catch (error) {
    next(error);
  }
}

export async function verifySubmission(req, res, next) {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const submission = await updateSubmission(id, { payment_status: 'verified' });
    void appendSubmissionToGoogleSheet(submission, 'verified').catch((err) =>
      console.error('[sheets]', err.message || err)
    );
    res.json({ submission });
  } catch (error) {
    next(error);
  }
}

/** One-time / occasional: push all DB rows to the sheet (oldest first). Requires Sheets env + sharing. */
export async function backfillGoogleSheets(req, res, next) {
  try {
    if (!isGoogleSheetsConfigured()) {
      throw new AppError('Google Sheets is not configured (spreadsheet ID + service account).', 503);
    }

    const submissions = await listSubmissions(undefined, { ascending: true });
    const result = await appendSubmissionsBatchToGoogleSheet(submissions, 'backfill');
    if (result.skipped) {
      throw new AppError('Google Sheets append was skipped (check credentials).', 503);
    }

    res.json({
      appended: result.appended,
      updatedRange: result.updatedRange ?? null
    });
  } catch (error) {
    next(error);
  }
}
