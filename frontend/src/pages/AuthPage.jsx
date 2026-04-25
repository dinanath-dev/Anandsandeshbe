import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, Mail, MapPin, Sparkles } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  getCurrentUser,
  loginWithPassword,
  requestEmailOtp,
  resetPasswordWithOtp,
  verifyEmailOtp
} from '../services/api.js';
import { clearPendingOtp, getPendingOtp, isUserAuthenticated, savePendingOtp, saveUserAuth } from '../utils/auth.js';
import SubscriptionHeroVisual from '../components/SubscriptionHeroVisual.jsx';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

function buildMaskedEmail(email) {
  const [name = '', domain = ''] = email.split('@');
  if (!name || !domain) return email;
  const visible = name.length <= 2 ? name[0] || '' : `${name[0]}${name[name.length - 1]}`;
  return `${visible}${'•'.repeat(Math.max(name.length - 2, 2))}@${domain}`;
}

function AuthMarketingCard({ compact = false, showGif = true }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/25 bg-white/12 shadow-[0_24px_56px_-12px_rgba(6,13,26,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-white/10 backdrop-blur-xl ${
        compact ? 'p-5' : 'px-7 py-8 xl:px-8 xl:py-9'
      }`}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-gradient-to-br from-sky-400/20 to-[#1e4a9e]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-gradient-to-tr from-[#0d2d7f]/15 to-slate-200/10 blur-3xl"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#c9a43a] via-[#0d2d7f] to-sky-400"
        aria-hidden
      />

      <div className="relative z-[1]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex max-w-full items-center gap-2.5 rounded-2xl border border-white/30 bg-white/15 px-3.5 py-2.5 text-left text-sm font-semibold leading-snug text-slate-900 shadow-sm backdrop-blur-md sm:px-4 sm:py-2.5 sm:text-[0.95rem]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/35 text-primary shadow-inner ring-1 ring-white/40 sm:h-8 sm:w-8">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            </span>
            <span>Anand Sandesh — subscription portal</span>
          </div>
        </div>
        <h1
          className={`mt-5 font-black tracking-[-0.04em] ${
            compact ? 'text-2xl leading-tight sm:text-3xl' : 'text-3xl leading-[1.12] sm:text-4xl xl:text-[2.55rem] xl:leading-[1.08]'
          }`}
        >
          <span className="bg-gradient-to-r from-[#041a33] via-[#0d2d7f] to-[#1e4a9e] bg-clip-text text-transparent">
            Login and sign up
          </span>
        </h1>
        <div className="mt-5 flex gap-3 rounded-xl border border-white/25 bg-white/10 p-3.5 shadow-inner backdrop-blur-md sm:mt-6 sm:p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/25 text-primary shadow-sm ring-1 ring-white/35">
            <MapPin className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.25} aria-hidden />
          </div>
          <p className="min-w-0 text-sm font-medium leading-relaxed text-slate-800 sm:text-base sm:leading-7">
            Anand Sandesh Karyale, Shri Anandpur Dham, Post Office Shri Anandpur,{' '}
            <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">473331</span>
          </p>
        </div>
        {showGif ? (
          <div className="mt-5 flex justify-center sm:mt-6">
            <SubscriptionHeroVisual
              className={compact ? 'max-h-[min(38vh,16rem)] max-w-[min(100%,20rem)]' : ''}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const otpRefs = useRef([]);
  const [mode, setMode] = useState('signup');
  const [flow, setFlow] = useState('normal');
  const [loginTab, setLoginTab] = useState('otp');
  const [step, setStep] = useState('details');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [otpValues, setOtpValues] = useState(Array.from({ length: OTP_LENGTH }, () => ''));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [devOtp, setDevOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    if (step !== 'otp' || resendIn <= 0) return undefined;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [step, resendIn]);

  useEffect(() => {
    const pending = getPendingOtp();
    if (!pending?.email) return;

    if (pending.flow === 'forgot' || pending.mode === 'reset') {
      setFlow('forgot');
      setMode('login');
    } else {
      setMode(pending.mode === 'login' ? 'login' : 'signup');
    }
    setForm({
      fullName: pending.fullName || '',
      email: pending.email || '',
      password: '',
      confirmPassword: '',
      newPassword: '',
      confirmNewPassword: ''
    });
    setDevOtp(pending.devOtp || '');
    setStep('otp');

    const expMs =
      typeof pending.expiresAt === 'string' ? Date.parse(pending.expiresAt) : Number(pending.expiresAt);
    const secondsLeft = Number.isFinite(expMs)
      ? Math.max(0, Math.ceil((expMs - Date.now()) / 1000))
      : RESEND_SECONDS;
    setResendIn(secondsLeft > RESEND_SECONDS ? RESEND_SECONDS : secondsLeft);
  }, []);

  if (isUserAuthenticated()) {
    return <Navigate to="/form" replace />;
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setStatus('');
  }

  function resetOtpBoxes() {
    setOtpValues(Array.from({ length: OTP_LENGTH }, () => ''));
    window.setTimeout(() => otpRefs.current[0]?.focus(), 0);
  }

  function validateBeforeSendOtp() {
    if (!form.email.trim()) {
      setError('Please enter your email address.');
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address.');
      return false;
    }

    if (flow === 'forgot') return true;

    if (mode === 'signup') {
      if (!form.fullName.trim()) {
        setError('Please enter your full name to create your account.');
        return false;
      }
      if (form.password.trim().length < 6) {
        setError('Password must be at least 6 characters.');
        return false;
      }
      if (form.password !== form.confirmPassword) {
        setError('Passwords do not match.');
        return false;
      }
    }

    return true;
  }

  async function issueOtp() {
    const email = form.email.trim().toLowerCase();
    const effectiveMode = flow === 'forgot' ? 'reset' : mode;

    const payload = {
      email,
      fullName: mode === 'signup' ? form.fullName.trim() : '',
      mode: effectiveMode
    };

    if (effectiveMode === 'signup') {
      payload.password = form.password.trim();
    }

    const data = await requestEmailOtp(payload);
    const expMs = typeof data.expiresAt === 'string' ? Date.parse(data.expiresAt) : Number(data.expiresAt);

    savePendingOtp({
      ...payload,
      flow: flow === 'forgot' ? 'forgot' : 'normal',
      expiresAt: Number.isFinite(expMs) ? expMs : Date.now() + 10 * 60 * 1000,
      devOtp: data.devOtp || ''
    });
    setDevOtp(data.devOtp || '');
    setStep('otp');
    setResendIn(RESEND_SECONDS);
    resetOtpBoxes();
    setStatus(data.message || `A 6-digit verification code has been sent to ${buildMaskedEmail(email)}.`);
  }

  async function handleSendOtp(event) {
    event.preventDefault();
    setError('');
    setStatus('');

    if (!validateBeforeSendOtp()) return;

    setIsSendingOtp(true);
    try {
      await issueOtp();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function handlePasswordLogin(event) {
    event.preventDefault();
    setError('');
    setStatus('');

    if (!form.email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!form.password.trim()) {
      setError('Please enter your password.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const data = await loginWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password.trim()
      });
      const verifiedAt = new Date().toISOString();
      saveUserAuth({
        token: data.token,
        user: data.user,
        verifiedAt
      });
      try {
        const me = await getCurrentUser();
        if (me?.user) {
          saveUserAuth({
            token: data.token,
            user: { ...data.user, ...me.user },
            verifiedAt
          });
        }
      } catch {
        // Optional profile refresh failed; token is already stored.
      }
      clearPendingOtp();
      navigate('/form', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setError('');
    setStatus('');

    const enteredOtp = otpValues.join('');
    if (enteredOtp.length !== OTP_LENGTH) {
      setError('Please enter the complete 6-digit OTP.');
      return;
    }
    if (form.newPassword.trim().length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (form.newPassword !== form.confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsResettingPassword(true);
    try {
      await resetPasswordWithOtp({
        email: form.email.trim().toLowerCase(),
        otp: enteredOtp,
        newPassword: form.newPassword.trim()
      });
      setStatus('Password reset successful. Sign in with your new password.');
      clearPendingOtp();
      setFlow('normal');
      setLoginTab('password');
      setStep('details');
      setOtpValues(Array.from({ length: OTP_LENGTH }, () => ''));
      setForm((current) => ({
        ...current,
        password: '',
        confirmPassword: '',
        newPassword: '',
        confirmNewPassword: ''
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsResettingPassword(false);
    }
  }

  function handleOtpChange(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtpValues((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    setError('');

    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index, event) {
    if (event.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }

    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpPaste(event) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;

    const next = Array.from({ length: OTP_LENGTH }, (_, index) => pasted[index] || '');
    setOtpValues(next);
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    otpRefs.current[focusIndex]?.focus();
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    if (flow === 'forgot') return;

    setError('');
    setStatus('');

    const enteredOtp = otpValues.join('');
    if (enteredOtp.length !== OTP_LENGTH) {
      setError('Please enter the complete 6-digit OTP.');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const data = await verifyEmailOtp({
        email: form.email.trim().toLowerCase(),
        otp: enteredOtp
      });

      const verifiedAt = new Date().toISOString();
      saveUserAuth({
        token: data.token,
        user: data.user,
        verifiedAt
      });
      try {
        const me = await getCurrentUser();
        if (me?.user) {
          saveUserAuth({
            token: data.token,
            user: { ...data.user, ...me.user },
            verifiedAt
          });
        }
      } catch {
        // Optional profile refresh failed; token is already stored.
      }
      clearPendingOtp();

      navigate('/form', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsVerifyingOtp(false);
    }
  }

  async function handleResendOtp() {
    if (resendIn > 0) return;
    setError('');
    setStatus('');

    setIsSendingOtp(true);
    try {
      await issueOtp();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSendingOtp(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setFlow('normal');
    setLoginTab('otp');
    setStep('details');
    setError('');
    setStatus('');
    setDevOtp('');
    setOtpValues(Array.from({ length: OTP_LENGTH }, () => ''));
    setForm({
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      newPassword: '',
      confirmNewPassword: ''
    });
    clearPendingOtp();
  }

  function selectLoginTab(tab) {
    setLoginTab(tab);
    setStep('details');
    setFlow('normal');
    setError('');
    setStatus('');
    setDevOtp('');
    setOtpValues(Array.from({ length: OTP_LENGTH }, () => ''));
    clearPendingOtp();
  }

  const showStepper =
    step === 'otp' ||
    (step === 'details' &&
      (mode === 'signup' || flow === 'forgot' || (mode === 'login' && loginTab === 'otp')));

  const cardTitle =
    flow === 'forgot' ? 'Reset password' : mode === 'signup' ? 'Create account' : 'Welcome back';

  return (
    <main className="auth-page min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
      <div className="auth-grid mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl items-stretch overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 shadow-[0_32px_120px_rgba(6,13,26,0.45)] backdrop-blur-2xl">
        <section className="auth-hero relative hidden flex-1 flex-col overflow-hidden px-8 py-10 text-[#0d2d7f] lg:flex lg:justify-between xl:px-12">
          <div className="auth-hero-glow" aria-hidden />
          <div className="relative z-[1] max-w-xl">
            <AuthMarketingCard showGif={false} />
          </div>

          <div className="relative z-[1] my-6 flex flex-1 flex-col items-center justify-center lg:my-4">
            <SubscriptionHeroVisual />
          </div>
        </section>

        <section className="relative flex w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10 lg:max-w-[34rem] lg:px-10 xl:px-12">
          <div className="auth-card-shape auth-card-shape-one" aria-hidden />
          <div className="auth-card-shape auth-card-shape-two" aria-hidden />

          <div className="relative z-[1] w-full max-w-xl">
            <div className="mb-7 lg:hidden">
              <AuthMarketingCard compact showGif />
            </div>

            <div className="rounded-[2rem] border border-white/25 bg-white/15 p-5 shadow-[0_18px_50px_rgba(6,13,26,0.28)] ring-1 ring-white/15 backdrop-blur-xl sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Welcome</p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-900">{cardTitle}</h2>
                </div>
                <div className="rounded-2xl bg-white/25 p-3 text-primary ring-1 ring-white/35 backdrop-blur-sm">
                  <Mail size={22} />
                </div>
              </div>

              {flow === 'forgot' ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setFlow('normal');
                      setLoginTab('password');
                      setStep('details');
                      setError('');
                      setStatus('');
                      clearPendingOtp();
                    }}
                    className="text-sm font-semibold text-primary transition hover:text-slate-900"
                  >
                    ← Back to sign in
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-900/10 p-1 backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${mode === 'signup' ? 'bg-white/45 text-slate-900 shadow-sm ring-1 ring-white/40 backdrop-blur-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Sign up
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${mode === 'login' ? 'bg-white/45 text-slate-900 shadow-sm ring-1 ring-white/40 backdrop-blur-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Login
                    </button>
                  </div>

                  {mode === 'login' ? (
                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-900/10 p-1 backdrop-blur-sm">
                      <button
                        type="button"
                        onClick={() => selectLoginTab('otp')}
                        className={`rounded-2xl px-3 py-2.5 text-xs font-bold transition sm:text-sm ${loginTab === 'otp' ? 'bg-white/45 text-slate-900 shadow-sm ring-1 ring-white/40 backdrop-blur-sm' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        Email OTP
                      </button>
                      <button
                        type="button"
                        onClick={() => selectLoginTab('password')}
                        className={`rounded-2xl px-3 py-2.5 text-xs font-bold transition sm:text-sm ${loginTab === 'password' ? 'bg-white/45 text-slate-900 shadow-sm ring-1 ring-white/40 backdrop-blur-sm' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        Password
                      </button>
                    </div>
                  ) : null}
                </>
              )}

              {showStepper ? (
                <div className="mt-6 flex items-center gap-3 text-sm text-slate-600">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${step === 'details' ? 'bg-primary text-white shadow-sm' : 'bg-white/35 text-slate-800 ring-1 ring-white/30'}`}
                  >
                    1
                  </span>
                  <div className="h-px flex-1 bg-white/35" />
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${step === 'otp' ? 'bg-primary text-white shadow-sm' : 'bg-white/35 text-slate-800 ring-1 ring-white/30'}`}
                  >
                    2
                  </span>
                </div>
              ) : null}

              {step === 'details' ? (
                mode === 'login' && loginTab === 'password' && flow === 'normal' ? (
                  <form className="mt-6 space-y-4" onSubmit={handlePasswordLogin}>
                    <label className="block">
                      <span className="auth-label">Email address</span>
                      <input
                        className="auth-input"
                        type="email"
                        placeholder="name@example.com"
                        value={form.email}
                        onChange={(event) => updateField('email', event.target.value)}
                        autoComplete="email"
                      />
                    </label>
                    <label className="block">
                      <span className="auth-label">Password</span>
                      <input
                        className="auth-input"
                        type="password"
                        placeholder="Enter your password"
                        value={form.password}
                        onChange={(event) => updateField('password', event.target.value)}
                        autoComplete="current-password"
                      />
                    </label>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setFlow('forgot');
                          setStep('details');
                          setError('');
                          setStatus('');
                          clearPendingOtp();
                          setOtpValues(Array.from({ length: OTP_LENGTH }, () => ''));
                        }}
                        className="text-sm font-semibold text-[#234d36] underline-offset-2 transition hover:text-[#17311f] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>

                    {error ? <p className="auth-error">{error}</p> : null}
                    {status ? <p className="auth-success">{status}</p> : null}

                    <button className="auth-primary-btn w-full" type="submit" disabled={isLoggingIn}>
                      {isLoggingIn ? 'Signing in...' : 'Sign in'} <ArrowRight size={18} />
                    </button>
                  </form>
                ) : (
                  <form className="mt-6 space-y-4" onSubmit={handleSendOtp}>
                    {mode === 'signup' ? (
                      <>
                        <label className="block">
                          <span className="auth-label">Full name</span>
                          <input
                            className="auth-input"
                            type="text"
                            placeholder="Enter your full name"
                            value={form.fullName}
                            onChange={(event) => updateField('fullName', event.target.value)}
                            autoComplete="name"
                          />
                        </label>
                        <label className="block">
                          <span className="auth-label">Email address</span>
                          <input
                            className="auth-input"
                            type="email"
                            placeholder="name@example.com"
                            value={form.email}
                            onChange={(event) => updateField('email', event.target.value)}
                            autoComplete="email"
                          />
                        </label>
                        <label className="block">
                          <span className="auth-label">Password</span>
                          <input
                            className="auth-input"
                            type="password"
                            placeholder="At least 6 characters"
                            value={form.password}
                            onChange={(event) => updateField('password', event.target.value)}
                            autoComplete="new-password"
                          />
                        </label>
                        <label className="block">
                          <span className="auth-label">Confirm password</span>
                          <input
                            className="auth-input"
                            type="password"
                            placeholder="Re-enter your password"
                            value={form.confirmPassword}
                            onChange={(event) => updateField('confirmPassword', event.target.value)}
                            autoComplete="new-password"
                          />
                        </label>
                      </>
                    ) : (
                      <label className="block">
                        <span className="auth-label">Email address</span>
                        <input
                          className="auth-input"
                          type="email"
                          placeholder="name@example.com"
                          value={form.email}
                          onChange={(event) => updateField('email', event.target.value)}
                          autoComplete="email"
                        />
                      </label>
                    )}

                    {error ? <p className="auth-error">{error}</p> : null}
                    {status ? <p className="auth-success">{status}</p> : null}

                    <button className="auth-primary-btn w-full" type="submit" disabled={isSendingOtp}>
                      {isSendingOtp
                        ? 'Sending OTP...'
                        : flow === 'forgot'
                          ? 'Send reset code'
                          : 'Continue with email OTP'}{' '}
                      <ArrowRight size={18} />
                    </button>

                    <p className="text-center text-sm text-[#6b806f]">
                      {flow === 'forgot'
                        ? 'We will email a one-time code to set a new password.'
                        : mode === 'signup'
                          ? 'A one-time OTP verifies your email and activates your account. You can sign in with this password later.'
                          : 'A one-time 6-digit code will be sent to your email.'}
                    </p>
                  </form>
                )
              ) : flow === 'forgot' ? (
                <form className="mt-6" onSubmit={handleResetPassword}>
                  <div className="rounded-3xl border border-[#dfeadd] bg-[#f6faf2] p-4">
                    <p className="text-sm font-semibold text-[#1b4f35]">
                      Enter the OTP sent to {buildMaskedEmail(form.email.trim().toLowerCase())}
                    </p>
                    {devOtp ? (
                      <p className="mt-2 text-sm leading-6 text-[#5d7364]">
                        SMTP is not configured yet, so use development OTP{' '}
                        <span className="font-black text-[#17311f]">{devOtp}</span>.
                      </p>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-[#5d7364]">
                        Then choose a new password below.
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex items-center gap-2 sm:gap-3">
                    {otpValues.map((digit, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          otpRefs.current[index] = element;
                        }}
                        className="auth-otp-input"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(event) => handleOtpChange(index, event.target.value)}
                        onKeyDown={(event) => handleOtpKeyDown(index, event)}
                        onPaste={handleOtpPaste}
                        aria-label={`OTP digit ${index + 1}`}
                      />
                    ))}
                  </div>

                  <label className="mt-5 block">
                    <span className="auth-label">New password</span>
                    <input
                      className="auth-input"
                      type="password"
                      placeholder="At least 6 characters"
                      value={form.newPassword}
                      onChange={(event) => updateField('newPassword', event.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="auth-label">Confirm new password</span>
                    <input
                      className="auth-input"
                      type="password"
                      placeholder="Re-enter new password"
                      value={form.confirmNewPassword}
                      onChange={(event) => updateField('confirmNewPassword', event.target.value)}
                      autoComplete="new-password"
                    />
                  </label>

                  {error ? <p className="auth-error mt-4">{error}</p> : null}
                  {status ? <p className="auth-success mt-4">{status}</p> : null}

                  <button
                    className="auth-primary-btn mt-5 w-full"
                    type="submit"
                    disabled={isResettingPassword}
                  >
                    {isResettingPassword ? 'Updating...' : 'Update password'} <ChevronRight size={18} />
                  </button>

                  <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setStep('details');
                        setError('');
                        setStatus('');
                      }}
                      className="font-semibold text-[#234d36] transition hover:text-[#17311f]"
                    >
                      Change email
                    </button>

                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendIn > 0 || isSendingOtp}
                      className="font-semibold text-[#234d36] transition hover:text-[#17311f] disabled:cursor-not-allowed disabled:text-[#97aa9b]"
                    >
                      {resendIn > 0 ? `Resend in ${resendIn}s` : isSendingOtp ? 'Sending...' : 'Resend OTP'}
                    </button>
                  </div>
                </form>
              ) : (
                <form className="mt-6" onSubmit={handleVerifyOtp}>
                  <div className="rounded-3xl border border-[#dfeadd] bg-[#f6faf2] p-4">
                    <p className="text-sm font-semibold text-[#1b4f35]">
                      Enter the OTP sent to {buildMaskedEmail(form.email.trim().toLowerCase())}
                    </p>
                    {devOtp ? (
                      <p className="mt-2 text-sm leading-6 text-[#5d7364]">
                        SMTP is not configured yet, so use development OTP{' '}
                        <span className="font-black text-[#17311f]">{devOtp}</span>.
                      </p>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-[#5d7364]">
                        Check your inbox and enter the 6-digit code to continue.
                      </p>
                    )}
                  </div>

                  <div className="mt-5 flex items-center gap-2 sm:gap-3">
                    {otpValues.map((digit, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          otpRefs.current[index] = element;
                        }}
                        className="auth-otp-input"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(event) => handleOtpChange(index, event.target.value)}
                        onKeyDown={(event) => handleOtpKeyDown(index, event)}
                        onPaste={handleOtpPaste}
                        aria-label={`OTP digit ${index + 1}`}
                      />
                    ))}
                  </div>

                  {error ? <p className="auth-error mt-4">{error}</p> : null}
                  {status ? <p className="auth-success mt-4">{status}</p> : null}

                  <button className="auth-primary-btn mt-5 w-full" type="submit" disabled={isVerifyingOtp}>
                    {isVerifyingOtp ? 'Verifying...' : 'Verify and continue'} <ChevronRight size={18} />
                  </button>

                  <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setStep('details');
                        setError('');
                        setStatus('');
                      }}
                      className="font-semibold text-[#234d36] transition hover:text-[#17311f]"
                    >
                      Change email
                    </button>

                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendIn > 0 || isSendingOtp}
                      className="font-semibold text-[#234d36] transition hover:text-[#17311f] disabled:cursor-not-allowed disabled:text-[#97aa9b]"
                    >
                      {resendIn > 0 ? `Resend in ${resendIn}s` : isSendingOtp ? 'Sending...' : 'Resend OTP'}
                    </button>
                  </div>

                  <div className="mt-5 flex items-center gap-2 rounded-2xl bg-[#f7f8f7] px-4 py-3 text-sm text-[#5b7060]">
                    <CheckCircle2 size={18} className="text-[#2c7b49]" />
                    After OTP verification you can use this password to sign in next time.
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
