import { z } from 'zod';
import { allocateSubscriberNo } from '../models/authModel.js';
import {
  createSubmission,
  deleteSubmissionBySubscriberNo,
  findSubmissionsByAddressMatch,
  findSubmissionById,
  findSubmissionBySubscriberNo,
  findSubmissionForUser,
  findSubmissionsByMobileDigits,
  normalizeIndianMobile,
  parseRowLookupKey,
  updateSubmission
} from '../models/submissionModel.js';
import { uploadScreenshot } from '../utils/uploadScreenshot.js';
import { AppError } from '../utils/AppError.js';
import { appendSubmissionToGoogleSheet } from '../utils/googleSheets.js';
import { getRequestMeta, logger, maskEmail } from '../utils/logger.js';

const emptyToUndefined = (v) => (v === '' || v === undefined || v === null ? undefined : v);

const submissionIdSchema = z.preprocess((v) => {
  if (v === '' || v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}, z.number().int().positive().optional());

const formBodySchema = z.object({
  submissionId: submissionIdSchema,
  name: z.string().trim().min(1, 'Name is required.'),
  mobile: z.string().trim().regex(/^\d{10}$/, 'Mobile number must be 10 digits.'),
  email: z.string().trim().email('Enter a valid email address.'),
  gender: z.enum(['male', 'female'], { message: 'Select male or female.' }),
  address: z.string().trim(),
  house_no: z.string().trim().min(1, 'House number is required.'),
  street: z.string().trim().min(1, 'Street is required.'),
  area: z.string().trim().min(1, 'Area is required.'),
  town: z.string().trim().min(1, 'Town is required.'),
  district: z.string().trim().min(1, 'District is required.'),
  state: z.string().trim().min(1, 'State is required.'),
  pin: z.string().trim().regex(/^\d{4,10}$/, 'Enter a valid pincode (4–10 digits).'),
  rehbar: z.string().trim().min(1, 'Rehbar is required.'),
  anand_sandesh_lang: z.enum(['hindi', 'english'], { message: 'Choose Hindi or English for Anand Sandesh.' }),
  spiritual_bliss: z.preprocess((v) => {
    if (v === '' || v === undefined || v === null) return null;
    return v;
  }, z.union([z.literal('english'), z.null()])),
  subscription_type: z.enum(['yearly', 'five_year'], { message: 'Choose one year or five year subscription.' })
});

const findLegacySchema = z
  .object({
    mobile: z.string().trim().optional(),
    pin: z.string().trim().optional(),
    house_no: z.string().trim().optional(),
    street: z.string().trim().optional(),
    town: z.string().trim().optional()
  })
  .refine(
    (d) => {
      const m = normalizeIndianMobile(d.mobile);
      if (m && m.length === 10) return true;
      if (d.pin && d.house_no && d.street) return true;
      return false;
    },
    {
      message:
        'Enter the 10-digit mobile on your old form, or pin with house number and street as on the old record.'
    }
  );

const claimLegacySchema = z
  .object({
    legacyClaimKey: z
      .union([z.string().min(1), z.number().int().positive()])
      .optional(),
    legacySubscriberNo: z.union([z.coerce.number().int().positive(), z.string().min(1)]).optional(),
    mobile: z.string().trim().optional(),
    pin: z.string().trim().optional(),
    house_no: z.string().trim().optional(),
    street: z.string().trim().optional()
  })
  .refine(
    (d) =>
      (d.legacyClaimKey != null && String(d.legacyClaimKey).trim() !== '') ||
      d.legacySubscriberNo != null,
    { message: 'Choose which offline record to link (legacyClaimKey or legacySubscriberNo).' }
  )
  .refine(
    (d) => {
      const m = normalizeIndianMobile(d.mobile);
      if (m && m.length === 10) return true;
      if (d.pin && d.house_no && d.street) return true;
      return false;
    },
    {
      message:
        'Confirm with the same mobile number as on file, or pin + house number + street from the old record.'
    }
  );

const SUBMISSION_WRITE_KEYS = new Set([
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
  'screenshot_url',
  'plan_id',
  'razorpay_subscription_id',
  'razorpay_payment_id',
  'payment_status',
  'subscriber_no'
]);

function pickSubmissionUpdate(row) {
  const o = {};
  for (const k of SUBMISSION_WRITE_KEYS) {
    if (row[k] !== undefined) o[k] = row[k];
  }
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

function paymentRank(status) {
  const s = String(status || '');
  if (s === 'verified') return 2;
  if (s === 'pending') return 1;
  return 0;
}

function mergeLegacyRows(legacy, current, emailNorm, newSub) {
  const merged = { ...current, ...legacy };
  merged.email = emailNorm;
  merged.subscriber_no = newSub;
  if (paymentRank(current.payment_status) > paymentRank(legacy.payment_status)) {
    merged.payment_status = current.payment_status;
    if (current.razorpay_subscription_id != null)
      merged.razorpay_subscription_id = current.razorpay_subscription_id;
    if (current.razorpay_payment_id != null) merged.razorpay_payment_id = current.razorpay_payment_id;
    if (current.plan_id != null) merged.plan_id = current.plan_id;
    if (current.transaction_id != null) merged.transaction_id = current.transaction_id;
    if (current.screenshot_url != null) merged.screenshot_url = current.screenshot_url;
  }
  return merged;
}

function maskNameHint(name) {
  const s = String(name || '').trim();
  if (s.length <= 1) return '*';
  if (s.length === 2) return `${s[0]}*`;
  return `${s[0]}${'*'.repeat(Math.min(6, s.length - 2))}${s[s.length - 1]}`;
}

function maskEmailHint(email) {
  const e = String(email || '').trim().toLowerCase();
  const [u, dom] = e.split('@');
  if (!dom) return null;
  if (!u || u.length <= 1) return `*@${dom}`;
  return `${u[0]}***@${dom}`;
}

function legacyPassesVerification(row, { mobileDigits, pin, house_no, street }) {
  if (mobileDigits && normalizeIndianMobile(row.mobile) === mobileDigits) return true;
  if (pin && house_no && street) {
    const p = String(pin).trim();
    const h = String(house_no).trim().toLowerCase();
    const st = String(street).trim().toLowerCase();
    const rh = String(row.house_no || '').trim().toLowerCase();
    const rs = String(row.street || '').trim().toLowerCase();
    const rp = String(row.pin || '').trim();
    return rp === p && rh === h && rs === st;
  }
  return false;
}

function uniqueSubmissionsByNo(rows) {
  const m = new Map();
  for (const r of rows) {
    const k =
      r.subscriber_no != null && r.subscriber_no !== '' ? r.subscriber_no : r.id;
    if (k == null || k === '') continue;
    if (!m.has(k)) m.set(k, r);
  }
  return [...m.values()];
}

function subscriberNumsEqual(a, b) {
  if (a == null || b == null || a === '' || b === '') return false;
  return Number(a) === Number(b);
}

/** Row is already the primary submission for this login (same subscriber + email match). */
function rowIsCanonicalCurrentAccount(row, mySub, emailNorm) {
  const rowEmail = String(row.email || '').trim().toLowerCase();
  if (!subscriberNumsEqual(row.subscriber_no, mySub)) return false;
  return !rowEmail || rowEmail === emailNorm;
}

function resolveLegacyKeyRaw(body) {
  const fromClaim = body.legacyClaimKey;
  const raw =
    fromClaim != null && String(fromClaim).trim() !== ''
      ? typeof fromClaim === 'number'
        ? fromClaim
        : String(fromClaim).trim()
      : body.legacySubscriberNo;
  if (raw === undefined || raw === null) {
    throw new AppError('Choose which offline record to link.', 400);
  }
  if (parseRowLookupKey(raw) == null) {
    throw new AppError('Invalid offline record id.', 400);
  }
  return raw;
}

/** One normalized mobile may belong to at most one subscriber_no (this account’s row is allowed). */
async function assertMobileNotUsedByAnotherSubscriber(mobile10, ownSubscriberNo) {
  const digits = normalizeIndianMobile(mobile10);
  if (!digits || digits.length !== 10) return;
  const rows = await findSubmissionsByMobileDigits(digits);
  const clash = rows.find((r) => !subscriberNumsEqual(r.subscriber_no, ownSubscriberNo));
  if (clash) {
    throw new AppError(
      'This mobile number is already used for another subscription. Sign in with that account, use “find offline record” to link it, or contact support.',
      409
    );
  }
}

const LEGACY_MATCH_LIMIT = 15;

function applyOptionalAddressFilters(rows, { pin, house_no, street, town }) {
  let list = rows;
  if (pin) {
    const p = pin.trim();
    list = list.filter((r) => String(r.pin || '').trim() === p);
  }
  if (house_no) {
    const h = house_no.trim().toLowerCase();
    list = list.filter((r) => String(r.house_no || '').trim().toLowerCase() === h);
  }
  if (street) {
    const st = street.trim().toLowerCase();
    list = list.filter((r) => String(r.street || '').trim().toLowerCase() === st);
  }
  if (town) {
    const t = town.trim().toLowerCase();
    list = list.filter((r) => String(r.town || '').toLowerCase().includes(t));
  }
  return list;
}

export async function findLegacySubmissions(req, res, next) {
  try {
    const parsed = findLegacySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid search.', 400);
    }

    const emailNorm = req.user.email.trim().toLowerCase();
    const mySub = await allocateSubscriberNo(req.user.email);
    const { mobile, pin, house_no, street, town } = parsed.data;
    const mobileDigits = normalizeIndianMobile(mobile);

    let rows = [];
    if (mobileDigits && mobileDigits.length === 10) {
      rows = await findSubmissionsByMobileDigits(mobileDigits);
    } else {
      rows = await findSubmissionsByAddressMatch({ house_no, street, pin });
    }

    rows = applyOptionalAddressFilters(rows, { pin, house_no, street, town });
    rows = uniqueSubmissionsByNo(rows);
    rows = rows.filter((r) => !rowIsCanonicalCurrentAccount(r, mySub, emailNorm));
    rows = rows.filter((r) => String(r.email || '').trim().toLowerCase() !== emailNorm);
    rows = rows.slice(0, LEGACY_MATCH_LIMIT);

    const matches = rows.map((r) => {
      const hasSub = r.subscriber_no != null && r.subscriber_no !== '';
      const legacyClaimKey = hasSub ? Number(r.subscriber_no) : String(r.id);
      return {
        legacyClaimKey,
        subscriberNo: hasSub ? Number(r.subscriber_no) : null,
        rowId: typeof r.id === 'string' ? r.id : r.id != null ? String(r.id) : null,
        nameMasked: maskNameHint(r.name),
        town: r.town || null,
        district: r.district || null,
        pinLast4: r.pin ? String(r.pin).slice(-4) : null,
        emailMasked: maskEmailHint(r.email)
      };
    });

    logger.info('form.findLegacy.done', {
      ...getRequestMeta(req),
      email: maskEmail(emailNorm),
      matchCount: matches.length
    });

    res.json({ matches });
  } catch (e) {
    next(e);
  }
}

export async function claimLegacySubmission(req, res, next) {
  try {
    const parsed = claimLegacySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid claim.', 400);
    }

    const emailNorm = req.user.email.trim().toLowerCase();
    const newSub = await allocateSubscriberNo(req.user.email);
    const { mobile, pin, house_no, street } = parsed.data;
    const mobileDigits = normalizeIndianMobile(mobile);
    const legacyKeyRaw = resolveLegacyKeyRaw(parsed.data);

    const legacy = await findSubmissionById(legacyKeyRaw);
    if (!legacyPassesVerification(legacy, { mobileDigits, pin, house_no, street })) {
      throw new AppError(
        'Details do not match our records. Check mobile or address and try again.',
        403
      );
    }

    if (String(legacy.email || '').trim().toLowerCase() === emailNorm) {
      throw new AppError('This offline record is already on your current email.', 400);
    }

    const currentRow = await findSubmissionBySubscriberNo(newSub);

    if (!currentRow) {
      await updateSubmission(legacyKeyRaw, {
        subscriber_no: newSub,
        email: emailNorm
      });
      const submission = await findSubmissionById(newSub);
      logger.info('form.claimLegacy.transferred', {
        ...getRequestMeta(req),
        email: maskEmail(emailNorm),
        from: legacyKeyRaw,
        to: newSub
      });
      void appendSubmissionToGoogleSheet(submission, 'updated').catch((err) =>
        logger.warn('sheets.append.failed', {
          ...getRequestMeta(req),
          event: 'claim_transfer',
          message: err?.message || String(err)
        })
      );
      res.json({ submission, message: 'Your previous subscription data is now on this account.' });
      return;
    }

    const merged = mergeLegacyRows(legacy, currentRow, emailNorm, newSub);
    const submission = await updateSubmission(newSub, pickSubmissionUpdate(merged));
    await deleteSubmissionBySubscriberNo(legacyKeyRaw);

    logger.info('form.claimLegacy.merged', {
      ...getRequestMeta(req),
      email: maskEmail(emailNorm),
      droppedLegacy: legacyKeyRaw,
      subscriberNo: newSub
    });

    void appendSubmissionToGoogleSheet(submission, 'updated').catch((err) =>
      logger.warn('sheets.append.failed', {
        ...getRequestMeta(req),
        event: 'claim_merge',
        message: err?.message || String(err)
      })
    );

    res.json({ submission, message: 'Your previous subscription data is now on this account.' });
  } catch (e) {
    next(e);
  }
}

export async function getMySubmission(req, res, next) {
  try {
    const email = req.user.email.trim().toLowerCase();
    const subscriberNo = await allocateSubscriberNo(email);
    const submission = await findSubmissionForUser(email, subscriberNo);
    logger.info('form.getMySubmission.success', {
      ...getRequestMeta(req),
      email: maskEmail(email),
      subscriberNo
    });
    res.json({ submission });
  } catch (e) {
    next(e);
  }
}

export async function saveForm(req, res, next) {
  try {
    logger.info('form.save.start', {
      ...getRequestMeta(req),
      email: maskEmail(req.user?.email),
      hasFile: Boolean(req.file)
    });
    const parsed = formBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid form data.', 400);
    }

    if (parsed.data.email.trim().toLowerCase() !== req.user.email.trim().toLowerCase()) {
      throw new AppError('Please submit the form with your verified email address.', 403);
    }

    const subscriberNo = await allocateSubscriberNo(req.user.email);
    await assertMobileNotUsedByAnotherSubscriber(parsed.data.mobile, subscriberNo);

    const screenshotUrl = req.file ? await uploadScreenshot(req.file) : null;
    const { submissionId, ...formData } = parsed.data;

    if (submissionId != null && submissionId !== subscriberNo) {
      throw new AppError('Invalid submission reference.', 403);
    }

    if (submissionId) {
      const existing = await findSubmissionById(submissionId);
      if (
        existing.email &&
        existing.email.trim().toLowerCase() !== req.user.email.trim().toLowerCase()
      ) {
        throw new AppError('Please submit the form with your verified email address.', 403);
      }
      if (existing.payment_status !== 'pending' && existing.payment_status !== 'verified') {
        throw new AppError('Payment step is required before submitting the form.', 403);
      }

      const patch = {
        ...formData,
        subscriber_no: subscriberNo,
        payment_status: existing.payment_status || 'pending'
      };
      if (screenshotUrl) patch.screenshot_url = screenshotUrl;

      const submission = await updateSubmission(subscriberNo, patch);

      void appendSubmissionToGoogleSheet(submission, 'updated').catch((err) =>
        logger.warn('sheets.append.failed', {
          ...getRequestMeta(req),
          event: 'updated',
          message: err?.message || String(err)
        })
      );

      logger.info('form.save.updated', {
        ...getRequestMeta(req),
        email: maskEmail(req.user?.email),
        subscriberNo
      });
      res.json({ submission });
      return;
    }

    const existingRow = await findSubmissionBySubscriberNo(subscriberNo);
    const submission = await createSubmission({
      ...formData,
      subscriber_no: subscriberNo,
      transaction_id: existingRow?.transaction_id ?? null,
      screenshot_url: screenshotUrl ?? existingRow?.screenshot_url ?? null,
      payment_status: existingRow?.payment_status || 'pending'
    });

    void appendSubmissionToGoogleSheet(submission, 'created').catch((err) =>
      logger.warn('sheets.append.failed', {
        ...getRequestMeta(req),
        event: 'created',
        message: err?.message || String(err)
      })
    );

    logger.info('form.save.created', {
      ...getRequestMeta(req),
      email: maskEmail(req.user?.email),
      subscriberNo
    });
    res.status(201).json({ submission });
  } catch (error) {
    next(error);
  }
}
