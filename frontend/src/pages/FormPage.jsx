import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, LogOut } from 'lucide-react';
import Alert from '../components/Alert.jsx';
import DonationLayout from '../components/DonationLayout.jsx';
import DonationFormRow from '../components/DonationFormRow.jsx';
import { INDIAN_STATES } from '../data/indianStates.js';
import { getCurrentUser, getMyFormSubmission, submitUserForm } from '../services/api.js';
import { clearPendingOtp, clearUserAuth, getUserAuth } from '../utils/auth.js';

const initialForm = {
  firstName: '',
  lastName: '',
  subscriberNo: '',
  mobile: '',
  email: '',
  dobDay: '',
  dobMonth: '',
  dobYear: '',
  house_no: '',
  areaStreet: '',
  state: '',
  town: '',
  district: '',
  pin: '',
  gender: '',
  rehbar: '',
  address: '',
  anandSandesh: '',
  spiritualBliss: '',
  subscription: ''
};

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const MONTHS = [
  { v: '1', l: 'January' },
  { v: '2', l: 'February' },
  { v: '3', l: 'March' },
  { v: '4', l: 'April' },
  { v: '5', l: 'May' },
  { v: '6', l: 'June' },
  { v: '7', l: 'July' },
  { v: '8', l: 'August' },
  { v: '9', l: 'September' },
  { v: '10', l: 'October' },
  { v: '11', l: 'November' },
  { v: '12', l: 'December' }
];

function inputClass(field, errors) {
  return `donation-input ${errors[field] ? 'donation-input--invalid' : ''}`;
}

/** Map API/DB row to local form state (inverse of buildPayload). */
function submissionToFormState(sub) {
  if (!sub) return null;
  const name = String(sub.name || '').trim();
  const nameParts = name ? name.split(/\s+/).filter(Boolean) : [];
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ');

  const rawAddr = String(sub.address || '').trim();
  let dobDay = '';
  let dobMonth = '';
  let dobYear = '';
  let addressRest = rawAddr;
  const dobMatch = rawAddr.match(/^Date of birth:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:\n([\s\S]*))?$/i);
  if (dobMatch) {
    dobDay = String(Number(dobMatch[1]));
    dobMonth = String(Number(dobMatch[2]));
    dobYear = dobMatch[3];
    addressRest = (dobMatch[4] || '').trim();
  }

  const street = String(sub.street || '').trim();
  const area = String(sub.area || '').trim();
  let areaStreet = '';
  if (street && area && street === area) areaStreet = street;
  else if (street && area) areaStreet = `${street}\n${area}`;
  else areaStreet = street || area;

  const sn = sub.subscriber_no != null ? String(sub.subscriber_no) : '';

  return {
    firstName,
    lastName,
    subscriberNo: sn,
    mobile: String(sub.mobile || '').trim(),
    email: String(sub.email || '').trim(),
    dobDay,
    dobMonth,
    dobYear,
    house_no: String(sub.house_no || '').trim(),
    areaStreet,
    state: String(sub.state || '').trim(),
    town: String(sub.town || '').trim(),
    district: String(sub.district || '').trim(),
    pin: String(sub.pin || '').trim(),
    gender: sub.gender === 'male' || sub.gender === 'female' ? sub.gender : '',
    rehbar: String(sub.rehbar || '').trim(),
    address: addressRest,
    anandSandesh:
      sub.anand_sandesh_lang === 'hindi' || sub.anand_sandesh_lang === 'english'
        ? sub.anand_sandesh_lang
        : '',
    spiritualBliss: sub.spiritual_bliss === 'english' ? 'english' : '',
    subscription:
      sub.subscription_type === 'yearly' || sub.subscription_type === 'five_year'
        ? sub.subscription_type
        : ''
  };
}

export default function FormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedSubmissionId, setSavedSubmissionId] = useState(null);

  const years = useMemo(() => {
    const y = [];
    const max = new Date().getFullYear();
    for (let yr = max; yr >= 1940; yr -= 1) y.push(String(yr));
    return y;
  }, []);

  useEffect(() => {
    const auth = getUserAuth();
    const email = auth?.user?.email || '';
    const fullName = auth?.user?.fullName?.trim() || '';
    const sub =
      auth?.user?.subscriberNo != null && auth?.user?.subscriberNo !== ''
        ? String(auth.user.subscriberNo)
        : '';

    if (!email && !fullName) return;

    const nameParts = fullName ? fullName.split(/\s+/).filter(Boolean) : [];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');

    setForm((current) => ({
      ...current,
      email: current.email || email,
      firstName: current.firstName || firstName,
      lastName: current.lastName || lastName,
      subscriberNo: current.subscriberNo || sub
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Apply profile/subscriber as soon as this returns — do not wait for saved form fetch.
    getCurrentUser()
      .then((meRes) => {
        if (cancelled) return;
        const user = meRes?.user;
        if (user?.subscriberNo == null) return;
        setForm((c) => ({
          ...c,
          subscriberNo: c.subscriberNo || String(user.subscriberNo)
        }));
      })
      .catch(() => {
        // not signed in or network
      });

    getMyFormSubmission()
      .then((subRes) => {
        if (cancelled) return;
        const submission = subRes?.submission;
        const mapped = submission ? submissionToFormState(submission) : null;
        if (mapped && submission) {
          const sid =
            submission.subscriber_no != null ? Number(submission.subscriber_no) : NaN;
          if (Number.isInteger(sid) && sid > 0) setSavedSubmissionId(sid);
        }
        if (mapped) {
          setForm((c) => ({ ...c, ...mapped }));
        }
      })
      .catch(() => {
        // no saved row or network
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }

  function validate() {
    const nextErrors = {};
    if (!form.firstName.trim()) nextErrors.firstName = 'First Name is required';
    if (!form.mobile.trim()) nextErrors.mobile = 'Mobile number is required';
    else if (!/^\d{10}$/.test(form.mobile)) nextErrors.mobile = 'Enter a valid 10 digit mobile number';
    if (!form.email.trim()) nextErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nextErrors.email = 'Enter a valid email';

    const dobParts = [form.dobDay, form.dobMonth, form.dobYear].filter(Boolean);
    if (dobParts.length > 0 && dobParts.length < 3) {
      nextErrors.dob = 'Select day, month, and year for date of birth';
    }

    if (!form.house_no.trim()) nextErrors.house_no = 'This field is required';
    if (!form.areaStreet.trim()) nextErrors.areaStreet = 'This field is required';
    if (!form.state.trim()) nextErrors.state = 'Please select state';
    if (!form.town.trim()) nextErrors.town = 'This field is required';
    if (!form.district.trim()) nextErrors.district = 'District is required';
    if (!form.pin.trim()) nextErrors.pin = 'Pincode is required';
    else if (!/^\d{4,10}$/.test(form.pin)) nextErrors.pin = 'Enter a valid pincode';
    if (!form.gender) nextErrors.gender = 'Select gender';
    if (!form.rehbar.trim()) nextErrors.rehbar = 'Rehbar is required';
    if (!form.anandSandesh) nextErrors.anandSandesh = 'Choose Hindi or English for Anand Sandesh';
    if (!form.subscription) nextErrors.subscription = 'Choose one year or five year subscription';
    if (!form.subscriberNo.trim()) {
      nextErrors.subscriberNo = 'Subscriber number not loaded. Wait a moment or sign in again.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function buildPayload() {
    const lines = form.areaStreet.split('\n').map((l) => l.trim()).filter(Boolean);
    let streetVal = '';
    let areaVal = '';
    if (lines.length === 1) {
      streetVal = lines[0];
      areaVal = lines[0];
    } else if (lines.length > 1) {
      streetVal = lines[0];
      areaVal = lines.slice(1).join('\n');
    }

    const name = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ');
    let addr = form.address.trim();
    if (form.dobDay && form.dobMonth && form.dobYear) {
      addr = `Date of birth: ${form.dobDay}/${form.dobMonth}/${form.dobYear}${addr ? `\n${addr}` : ''}`.trim();
    }

    return {
      name,
      mobile: form.mobile.trim(),
      email: form.email.trim(),
      gender: form.gender,
      house_no: form.house_no.trim(),
      street: streetVal,
      area: areaVal,
      town: form.town.trim(),
      district: form.district.trim(),
      state: form.state.trim(),
      pin: form.pin.trim(),
      rehbar: form.rehbar.trim(),
      address: addr,
      anand_sandesh_lang: form.anandSandesh,
      spiritual_bliss: form.spiritualBliss === 'english' ? 'english' : '',
      subscription_type: form.subscription
    };
  }

  function handleLogout() {
    clearUserAuth();
    clearPendingOtp();
    navigate('/', { replace: true });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setApiError('');
    if (!validate()) return;

    const payload = buildPayload();
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
    if (savedSubmissionId != null) {
      formData.append('submissionId', String(savedSubmissionId));
    }

    setIsSubmitting(true);
    try {
      const data = await submitUserForm(formData);
      const submissionId = data.submission?.id;
      if (!submissionId) throw new Error('Could not save submission. Please try again.');
      navigate('/payment', { state: { submissionId, subscriptionType: form.subscription } });
    } catch (err) {
      setApiError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DonationLayout subtitle="My Submission Details for Anand Sandesh">
      <button
        type="button"
        className="btn-secondary fixed right-4 top-4 z-[60] inline-flex min-h-10 items-center gap-2 px-4 py-2 text-sm font-semibold shadow-md sm:right-6 sm:top-5"
        onClick={handleLogout}
      >
        <LogOut size={18} aria-hidden /> Log out
      </button>
      <div className="donation-form-shell w-full px-1 py-2 sm:px-3 sm:py-3">
        <form onSubmit={handleSubmit} className="donation-form">
          {apiError ? (
            <div className="donation-form-banner mb-2">
              <Alert>{apiError}</Alert>
            </div>
          ) : null}

          <DonationFormRow label="First name" required error={errors.firstName} labelFor="df-firstName">
            <input
              id="df-firstName"
              className={inputClass('firstName', errors)}
              value={form.firstName}
              onChange={(e) => updateField('firstName', e.target.value)}
              autoComplete="given-name"
            />
          </DonationFormRow>

          <DonationFormRow label="Last name" error={errors.lastName} labelFor="df-lastName">
            <input
              id="df-lastName"
              className={inputClass('lastName', errors)}
              value={form.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              autoComplete="family-name"
            />
          </DonationFormRow>

          <DonationFormRow
            label="Subscriber no"
            error={errors.subscriberNo}
            labelFor="df-subscriberNo"
          >
            <input
              id="df-subscriberNo"
              className={`donation-input donation-input--readonly-subscriber ${errors.subscriberNo ? 'donation-input--invalid' : ''}`}
              value={form.subscriberNo}
              readOnly
              aria-readonly="true"
              autoComplete="off"
              title="Assigned when you sign in — not editable"
            />
          </DonationFormRow>

          <DonationFormRow label="Gender" required error={errors.gender} labelFor="df-gender">
            <select
              id="df-gender"
              className={inputClass('gender', errors)}
              value={form.gender}
              onChange={(e) => updateField('gender', e.target.value)}
            >
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </DonationFormRow>

          <DonationFormRow label="Mobile number" required error={errors.mobile} labelFor="df-mobile">
            <input
              id="df-mobile"
              className={inputClass('mobile', errors)}
              inputMode="numeric"
              maxLength={10}
              value={form.mobile}
              onChange={(e) => updateField('mobile', e.target.value.replace(/\D/g, ''))}
              autoComplete="tel"
            />
          </DonationFormRow>

          <DonationFormRow label="Email" required error={errors.email} labelFor="df-email">
            <p id="df-email-hint" className="sr-only">
              Email is compulsory.
            </p>
            <input
              id="df-email"
              type="email"
              className={inputClass('email', errors)}
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              autoComplete="email"
              title="Email is compulsory — you must enter a valid email address."
              aria-describedby="df-email-hint"
              readOnly
            />
          </DonationFormRow>

          <DonationFormRow label="Date of birth" error={errors.dob}>
            <div className="flex flex-wrap gap-2">
              <select
                className={`donation-input w-[min(30%,5.5rem)] flex-1 min-w-[4.5rem] ${errors.dob ? 'donation-input--invalid' : ''}`}
                value={form.dobDay}
                onChange={(e) => updateField('dobDay', e.target.value)}
              >
                <option value="">Day</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                className={`donation-input min-w-[6.5rem] flex-[1.2] ${errors.dob ? 'donation-input--invalid' : ''}`}
                value={form.dobMonth}
                onChange={(e) => updateField('dobMonth', e.target.value)}
              >
                <option value="">Month</option>
                {MONTHS.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.l}
                  </option>
                ))}
              </select>
              <select
                className={`donation-input w-[min(34%,6.5rem)] flex-1 min-w-[4.75rem] ${errors.dob ? 'donation-input--invalid' : ''}`}
                value={form.dobYear}
                onChange={(e) => updateField('dobYear', e.target.value)}
              >
                <option value="">Year</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </DonationFormRow>

          <DonationFormRow label="Rehbar" required error={errors.rehbar} labelFor="df-rehbar">
            <input id="df-rehbar" className={inputClass('rehbar', errors)} value={form.rehbar} onChange={(e) => updateField('rehbar', e.target.value)} />
          </DonationFormRow>

          <DonationFormRow label="Flat, House no., Building name" required error={errors.house_no} labelFor="df-house">
            <textarea
              id="df-house"
              className={inputClass('house_no', errors)}
              value={form.house_no}
              onChange={(e) => updateField('house_no', e.target.value)}
              rows={3}
            />
          </DonationFormRow>

          <DonationFormRow label="Area, street, sector" required error={errors.areaStreet} labelFor="df-areaStreet">
            <textarea
              id="df-areaStreet"
              className={inputClass('areaStreet', errors)}
              value={form.areaStreet}
              onChange={(e) => updateField('areaStreet', e.target.value)}
              rows={3}
            />
          </DonationFormRow>

          <DonationFormRow label="State" required error={errors.state} labelFor="df-state">
            <select
              id="df-state"
              className={inputClass('state', errors)}
              value={form.state}
              onChange={(e) => updateField('state', e.target.value)}
            >
              <option value="">Please select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </DonationFormRow>

          <DonationFormRow label="Village / Town / City" required error={errors.town} labelFor="df-town">
            <input
              id="df-town"
              className={inputClass('town', errors)}
              value={form.town}
              onChange={(e) => updateField('town', e.target.value)}
            />
          </DonationFormRow>

          <DonationFormRow label="District" required error={errors.district} labelFor="df-district">
            <input
              id="df-district"
              className={inputClass('district', errors)}
              value={form.district}
              onChange={(e) => updateField('district', e.target.value)}
            />
          </DonationFormRow>

          <DonationFormRow label="Pincode" required error={errors.pin} labelFor="df-pin">
            <input
              id="df-pin"
              className={inputClass('pin', errors)}
              inputMode="numeric"
              maxLength={10}
              value={form.pin}
              onChange={(e) => updateField('pin', e.target.value.replace(/\D/g, ''))}
            />
          </DonationFormRow>

          <DonationFormRow label="Additional information / remarks" error={errors.address} labelFor="df-address">
            <textarea
              id="df-address"
              className={inputClass('address', errors)}
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              rows={3}
            />
          </DonationFormRow>

          <DonationFormRow label="Anand Sandesh" required error={errors.anandSandesh}>
            <div className={`space-y-2 rounded border px-3 py-3 sm:px-4 ${errors.anandSandesh ? 'donation-input--invalid border-red-800/50 bg-[#fffafa]' : 'border-[#0d2d7f]/28 bg-white/80'}`}>
              <p className="text-left text-xs font-semibold text-muted">Language option</p>
              <label className="flex cursor-pointer items-start gap-3 text-left text-sm text-ink">
                <input
                  type="radio"
                  name="anandSandesh"
                  value="hindi"
                  checked={form.anandSandesh === 'hindi'}
                  onChange={() => updateField('anandSandesh', 'hindi')}
                  className="mt-1"
                />
                <span className="font-bold">Hindi</span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 border-t border-ink/10 pt-2 text-left text-sm text-ink">
                <input
                  type="radio"
                  name="anandSandesh"
                  value="english"
                  checked={form.anandSandesh === 'english'}
                  onChange={() => updateField('anandSandesh', 'english')}
                  className="mt-1"
                />
                <span className="font-bold">English</span>
              </label>
            </div>
          </DonationFormRow>

          <DonationFormRow label="Spiritual Bliss" error={errors.spiritualBliss}>
            <div
              className={`space-y-2 rounded border px-3 py-3 sm:px-4 ${errors.spiritualBliss ? 'donation-input--invalid border-red-800/50 bg-[#fffafa]' : 'border-[#0d2d7f]/28 bg-white/80'}`}
            >
              <p className="text-left text-xs font-semibold text-muted">Optional · English only</p>
              <label className="flex cursor-pointer items-start gap-3 text-left text-sm text-ink">
                <input
                  type="checkbox"
                  name="spiritualBliss"
                  checked={form.spiritualBliss === 'english'}
                  onChange={(e) => updateField('spiritualBliss', e.target.checked ? 'english' : '')}
                  className="mt-1"
                />
                <span className="font-bold">English</span>
              </label>
            </div>
          </DonationFormRow>

          <DonationFormRow label="Subscription" required error={errors.subscription}>
            <div className={`space-y-2 rounded border px-3 py-3 sm:px-4 ${errors.subscription ? 'donation-input--invalid border-red-800/50 bg-[#fffafa]' : 'border-[#0d2d7f]/28 bg-white/80'}`}>
              <label className="flex cursor-pointer items-start gap-3 text-left text-sm text-ink">
                <input
                  type="radio"
                  name="subscription"
                  value="yearly"
                  checked={form.subscription === 'yearly'}
                  onChange={() => updateField('subscription', 'yearly')}
                  className="mt-1"
                />
                <span>
                  <span className="font-bold">One year</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted">Renews every year</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 border-t border-ink/10 pt-2 text-left text-sm text-ink">
                <input
                  type="radio"
                  name="subscription"
                  value="five_year"
                  checked={form.subscription === 'five_year'}
                  onChange={() => updateField('subscription', 'five_year')}
                  className="mt-1"
                />
                <span>
                  <span className="font-bold">5 year</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted">One payment for five years</span>
                </span>
              </label>
            </div>
          </DonationFormRow>

          <div className="donation-form-actions">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary donation-form-submit-btn !min-h-10 inline-flex items-center gap-2 !px-8 !py-2 !text-sm font-semibold sm:!text-[0.9375rem]"
            >
              <CreditCard size={18} /> {isSubmitting ? 'Saving...' : 'Proceed to payment'}
            </button>
          </div>
        </form>
      </div>
    </DonationLayout>
  );
}
