import { z } from 'zod';
import { allocateSubscriberNo } from '../models/authModel.js';
import { createSubmission } from '../models/submissionModel.js';
import { uploadScreenshot } from '../utils/uploadScreenshot.js';
import { AppError } from '../utils/AppError.js';
import { appendSubmissionToGoogleSheet } from '../utils/googleSheets.js';

const paymentSchema = z.object({
  transaction_id: z.string().trim().max(120).optional().or(z.literal(''))
});

export async function savePayment(req, res, next) {
  try {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('Invalid payment details.', 400);

    const screenshotUrl = await uploadScreenshot(req.file);
    const transactionId = parsed.data.transaction_id || null;

    if (!transactionId && !screenshotUrl) {
      throw new AppError('Provide a transaction ID or upload a payment screenshot.', 400);
    }

    const email = req.user.email.trim().toLowerCase();
    const subscriberNo = await allocateSubscriberNo(email);

    const submission = await createSubmission({
      subscriber_no: subscriberNo,
      email,
      transaction_id: transactionId,
      screenshot_url: screenshotUrl,
      payment_status: 'pending'
    });

    void appendSubmissionToGoogleSheet(submission, 'payment_upload').catch((err) =>
      console.error('[sheets]', err.message || err)
    );

    res.status(201).json({ submissionId: submission.id, payment_status: submission.payment_status });
  } catch (error) {
    next(error);
  }
}
