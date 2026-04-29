import { z } from 'zod';
import { allocateSubscriberNo } from '../models/authModel.js';
import {
  createSubmission,
  findSubmissionByRazorpayPaymentId,
  findSubmissionByRazorpaySubscriptionId,
  updateSubmission
} from '../models/submissionModel.js';
import { uploadScreenshot } from '../utils/uploadScreenshot.js';
import { AppError } from '../utils/AppError.js';
import { appendSubmissionToGoogleSheet } from '../utils/googleSheets.js';
import { getRequestMeta, logger, maskEmail } from '../utils/logger.js';
import { sendPaymentReceiptEmail } from '../utils/mailer.js';
import {
  createRazorpaySubscription,
  razorpayErrorToAppError,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature
} from '../utils/razorpayClient.js';

const paymentSchema = z.object({
  transaction_id: z.string().trim().max(120).optional().or(z.literal(''))
});

const createSubscriptionSchema = z.object({
  plan_id: z.string().trim().min(1, 'plan_id is required.'),
  total_count: z.coerce.number().int().positive().max(120).default(12)
});

const verifySubscriptionSchema = z.object({
  razorpay_payment_id: z.string().trim().min(1),
  razorpay_subscription_id: z.string().trim().min(1),
  razorpay_signature: z.string().trim().min(1)
});

const webhookEventSchema = z.object({
  event: z.string().trim().min(1),
  payload: z.object({
    payment: z.object({ entity: z.any() }).optional(),
    subscription: z.object({ entity: z.any() }).optional()
  })
});

function mapRazorpayStateToStatus(state) {
  switch (state) {
    case 'active':
    case 'authenticated':
    case 'captured':
      return 'verified';
    case 'cancelled':
    case 'halted':
    case 'expired':
      return 'cancelled';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

export async function savePayment(req, res, next) {
  try {
    logger.info('payment.save.start', {
      ...getRequestMeta(req),
      email: maskEmail(req.user?.email),
      hasFile: Boolean(req.file)
    });
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
      logger.warn('sheets.append.failed', {
        ...getRequestMeta(req),
        event: 'payment_upload',
        message: err?.message || String(err)
      })
    );

    logger.info('payment.save.success', {
      ...getRequestMeta(req),
      email: maskEmail(email),
      subscriberNo
    });
    res.status(201).json({
      submissionId: submission.id,
      payment_status: submission.payment_status,
      deprecated: true,
      message: 'Manual payment upload is deprecated. Prefer Razorpay subscription APIs.'
    });
  } catch (error) {
    next(error);
  }
}

export async function createSubscription(req, res, next) {
  try {
    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || 'Invalid request.', 400);

    const email = req.user.email.trim().toLowerCase();
    const subscriberNo = await allocateSubscriberNo(email);

    const subscription = await createRazorpaySubscription({
      plan_id: parsed.data.plan_id,
      total_count: parsed.data.total_count,
      customer_notify: 1,
      notes: {
        email,
        subscriber_no: String(subscriberNo)
      }
    });

    await createSubmission({
      subscriber_no: subscriberNo,
      email,
      plan_id: parsed.data.plan_id,
      razorpay_subscription_id: subscription.id,
      payment_status: mapRazorpayStateToStatus(subscription.status || 'created')
    });

    logger.info('payment.subscription.created', {
      ...getRequestMeta(req),
      email: maskEmail(email),
      subscriberNo,
      subscriptionId: subscription.id,
      planId: parsed.data.plan_id
    });

    res.status(201).json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        plan_id: parsed.data.plan_id,
        total_count: parsed.data.total_count
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(razorpayErrorToAppError(error));
  }
}

export async function verifySubscription(req, res, next) {
  try {
    const parsed = verifySubscriptionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('Invalid verification payload.', 400);

    const isValid = verifyRazorpayCheckoutSignature(parsed.data);
    if (!isValid) throw new AppError('Invalid Razorpay signature.', 400);

    const current = await findSubmissionByRazorpaySubscriptionId(parsed.data.razorpay_subscription_id);
    if (!current) throw new AppError('Subscription not found.', 404);

    const wasVerified = current.payment_status === 'verified';

    const updated = await updateSubmission(current.id, {
      razorpay_payment_id: parsed.data.razorpay_payment_id,
      payment_status: 'verified'
    });

    if (!wasVerified && updated.email) {
      const paidAt = new Date().toISOString();
      void sendPaymentReceiptEmail({
        to: updated.email,
        fullName: updated.name,
        subscriberNo: updated.subscriber_no ?? updated.id,
        planId: updated.plan_id,
        razorpayPaymentId: parsed.data.razorpay_payment_id,
        razorpaySubscriptionId: parsed.data.razorpay_subscription_id,
        amountPaise: null,
        currency: 'INR',
        paidAtIso: paidAt
      }).catch((err) =>
        logger.warn('payment.receipt.email_failed', {
          ...getRequestMeta(req),
          message: err?.message || String(err)
        })
      );
    }

    logger.info('payment.subscription.verified', {
      ...getRequestMeta(req),
      submissionId: current.id,
      subscriptionId: parsed.data.razorpay_subscription_id
    });

    res.json({
      verified: true,
      submissionId: updated.id,
      payment_status: updated.payment_status
    });
  } catch (error) {
    next(error);
  }
}

export async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature || typeof signature !== 'string') {
      throw new AppError('Missing Razorpay signature header.', 400);
    }

    const rawBody = req.body;
    const isValidSignature = verifyRazorpayWebhookSignature(rawBody, signature);
    if (!isValidSignature) throw new AppError('Invalid webhook signature.', 400);

    const body = JSON.parse(rawBody.toString('utf8'));
    const parsed = webhookEventSchema.safeParse(body);
    if (!parsed.success) throw new AppError('Unsupported webhook payload.', 400);

    const event = parsed.data.event;
    const paymentEntity = parsed.data.payload.payment?.entity;
    const subscriptionEntity = parsed.data.payload.subscription?.entity;
    const subscriptionId = paymentEntity?.subscription_id || subscriptionEntity?.id;
    const paymentId = paymentEntity?.id;

    if (!subscriptionId) {
      logger.warn('payment.webhook.ignored', { ...getRequestMeta(req), event, reason: 'missing_subscription_id' });
      res.status(202).json({ processed: false, reason: 'missing_subscription_id' });
      return;
    }

    const row =
      (await findSubmissionByRazorpaySubscriptionId(subscriptionId)) ||
      (paymentId ? await findSubmissionByRazorpayPaymentId(paymentId) : null);

    if (!row) {
      logger.warn('payment.webhook.ignored', {
        ...getRequestMeta(req),
        event,
        subscriptionId,
        reason: 'submission_not_found'
      });
      res.status(202).json({ processed: false, reason: 'submission_not_found' });
      return;
    }

    const incomingStatus = mapRazorpayStateToStatus(subscriptionEntity?.status || paymentEntity?.status || 'pending');
    const nextPatch = {
      payment_status: incomingStatus,
      razorpay_subscription_id: subscriptionId,
      razorpay_payment_id: paymentId || row.razorpay_payment_id || null
    };

    const wasVerified = row.payment_status === 'verified';

    // Basic webhook idempotency: skip redundant updates if state is unchanged.
    if (row.payment_status === nextPatch.payment_status && row.razorpay_payment_id === nextPatch.razorpay_payment_id) {
      logger.info('payment.webhook.idempotent', {
        ...getRequestMeta(req),
        event,
        submissionId: row.id,
        subscriptionId
      });
      res.json({ processed: true, idempotent: true });
      return;
    }

    const updated = await updateSubmission(row.id, nextPatch);

    if (!wasVerified && updated.payment_status === 'verified' && updated.email) {
      let paidAt = new Date().toISOString();
      const created = paymentEntity?.created_at;
      if (created != null) {
        if (typeof created === 'number') paidAt = new Date(created * 1000).toISOString();
        else if (typeof created === 'string' && /^\d+$/.test(created))
          paidAt = new Date(Number(created) * 1000).toISOString();
        else if (typeof created === 'string') {
          const d = new Date(created);
          if (!Number.isNaN(d.getTime())) paidAt = d.toISOString();
        }
      }
      void sendPaymentReceiptEmail({
        to: updated.email,
        fullName: updated.name,
        subscriberNo: updated.subscriber_no ?? updated.id,
        planId: updated.plan_id,
        razorpayPaymentId: nextPatch.razorpay_payment_id,
        razorpaySubscriptionId: subscriptionId,
        amountPaise: paymentEntity?.amount,
        currency: paymentEntity?.currency || 'INR',
        paidAtIso: paidAt
      }).catch((err) =>
        logger.warn('payment.receipt.email_failed', {
          ...getRequestMeta(req),
          message: err?.message || String(err)
        })
      );
    }

    logger.info('payment.webhook.processed', {
      ...getRequestMeta(req),
      event,
      submissionId: updated.id,
      subscriptionId,
      paymentStatus: updated.payment_status
    });

    res.json({ processed: true, submissionId: updated.id });
  } catch (error) {
    next(error);
  }
}
