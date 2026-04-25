import { z } from 'zod';
import { allocateSubscriberNo } from '../models/authModel.js';
import {
  createSubmission,
  findSubmissionById,
  findSubmissionBySubscriberNo,
  findSubmissionForUser,
  updateSubmission
} from '../models/submissionModel.js';
import { uploadScreenshot } from '../utils/uploadScreenshot.js';
import { AppError } from '../utils/AppError.js';
import { appendSubmissionToGoogleSheet } from '../utils/googleSheets.js';

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

export async function getMySubmission(req, res, next) {
  try {
    const email = req.user.email.trim().toLowerCase();
    const subscriberNo = await allocateSubscriberNo(email);
    const submission = await findSubmissionForUser(email, subscriberNo);
    res.json({ submission });
  } catch (e) {
    next(e);
  }
}

export async function saveForm(req, res, next) {
  try {
    const parsed = formBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid form data.', 400);
    }

    if (parsed.data.email.trim().toLowerCase() !== req.user.email.trim().toLowerCase()) {
      throw new AppError('Please submit the form with your verified email address.', 403);
    }

    const subscriberNo = await allocateSubscriberNo(req.user.email);

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
        console.error('[sheets]', err.message || err)
      );

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
      console.error('[sheets]', err.message || err)
    );

    res.status(201).json({ submission });
  } catch (error) {
    next(error);
  }
}
