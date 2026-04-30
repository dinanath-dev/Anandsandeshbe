import crypto from 'crypto';
import Razorpay from 'razorpay';
import { AppError } from './AppError.js';

/** Map Razorpay Node SDK / HTTP errors to `AppError` so we never leak Razorpay's statusCode as our HTTP status. */
export function razorpayErrorToAppError(err) {
  const upstream = err?.statusCode;
  const desc =
    err?.error?.description ||
    (typeof err?.error === 'string' ? err.error : null) ||
    err?.message ||
    'Razorpay request failed';

  if (upstream === 401 || upstream === 403) {
    return new AppError(
      `Razorpay API rejected these credentials (HTTP ${upstream}). Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend .env — they must be the **Key ID** and **Key Secret** from the same Razorpay Dashboard account and mode (test vs live) as your plan_id. Details: ${desc}`,
      502
    );
  }
  if (typeof upstream === 'number' && upstream >= 400 && upstream < 500) {
    return new AppError(`Razorpay: ${desc}`, 400);
  }
  return new AppError(`Razorpay: ${desc}`, 502);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new AppError(`${name} is not configured.`, 500);
  return value;
}

let razorpayInstance;

export function getRazorpayClient() {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: requireEnv('RAZORPAY_KEY_ID'),
      key_secret: requireEnv('RAZORPAY_KEY_SECRET')
    });
  }
  return razorpayInstance;
}

export async function createRazorpaySubscription(payload) {
  const client = getRazorpayClient();
  return client.subscriptions.create(payload);
}

export async function fetchRazorpayPayment(paymentId) {
  const id = String(paymentId || '').trim();
  if (!id) return null;
  const client = getRazorpayClient();
  return client.payments.fetch(id);
}

export function verifyRazorpayCheckoutSignature({
  razorpay_payment_id,
  razorpay_subscription_id,
  razorpay_signature
}) {
  const secret = requireEnv('RAZORPAY_KEY_SECRET');
  const body = `${razorpay_payment_id}|${razorpay_subscription_id}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === razorpay_signature;
}

export function verifyRazorpayWebhookSignature(rawBody, signature) {
  const webhookSecret = requireEnv('RAZORPAY_WEBHOOK_SECRET');
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return expected === signature;
}
