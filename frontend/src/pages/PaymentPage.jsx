import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CreditCard } from 'lucide-react';
import DonationLayout from '../components/DonationLayout.jsx';

const SUBSCRIPTION_LABELS = {
  yearly: 'One year',
  five_year: '5 year'
};

export default function PaymentPage() {
  const { state } = useLocation();
  const submissionId = state?.submissionId;
  const subscriptionType = state?.subscriptionType;

  if (!submissionId || !subscriptionType) {
    return <Navigate to="/" replace />;
  }

  const planLabel = SUBSCRIPTION_LABELS[subscriptionType] || subscriptionType;

  return (
    <DonationLayout subtitle="Payment">
      <div className="donation-form-shell mx-auto max-w-lg px-2 py-4 text-center sm:px-4">
        <div className="rounded-lg border border-[#0d2d7f]/28 bg-white/90 px-5 py-8 shadow-md backdrop-blur-sm">
          <CreditCard className="mx-auto mb-4 text-primary" size={48} />
          <h2 className="text-xl font-black text-[#152a48] sm:text-2xl">Proceed to payment</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Your details are saved. Complete payment for your selected plan when your gateway is connected.
          </p>
          <p className="mt-4 text-base font-bold text-ink">
            Plan: <span className="text-primary font-black">{planLabel}</span>
          </p>
          <p className="mt-2 font-mono text-xs text-muted">Reference ID: {submissionId}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/" className="btn-secondary inline-flex min-h-10 items-center gap-2 px-5 py-2 text-sm">
              <ArrowLeft size={18} /> Edit details
            </Link>
          </div>
        </div>
      </div>
    </DonationLayout>
  );
}
