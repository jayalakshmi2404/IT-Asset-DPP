import React, { useId, useState } from 'react';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/common/Icon';
import { clearNotice, peekNotice } from '../services/session';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState(() => peekNotice());
  const [resetInfo, setResetInfo] = useState(false);

  if (!loading && user) {
    return <Navigate to={location.state?.from?.pathname || '/dashboard'} replace />;
  }

  function validate() {
    const errors = {};
    if (!email.trim()) errors.email = 'Enter your email address.';
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address, such as name@company.com.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    clearNotice();
    setNotice(null);
    setSubmitting(true);
    const result = await login(email.trim(), password, remember);
    setSubmitting(false);

    if (result.success) {
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } else {
      setPassword('');
      setError(result.message);
    }
  }

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,460px)]">
      {/* Hero artwork */}
      <section className="relative isolate flex min-h-[260px] flex-col justify-end overflow-hidden lg:min-h-screen" aria-label="Product overview">
        <img
          src="/assets/login-hero.jpg"
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover object-left"
          width="880"
          height="819"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-50 via-ink-50/40 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-ink-50/10 lg:to-ink-50" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-50/70 to-transparent lg:hidden" />

        <div className="px-6 pb-8 pt-10 sm:px-10 lg:pb-16 lg:pl-14">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src="/assets/logo-mark.svg" alt="" className="h-9 w-9" />
            <span className="text-sm font-semibold tracking-tight text-white">IT Asset DPP</span>
          </div>
          <h1 className="max-w-xl text-3xl font-bold leading-tight text-white sm:text-4xl">
            Your Assets.
            <span className="block bg-gradient-to-r from-cyan-glow via-brand-400 to-violet-glow bg-clip-text text-transparent">One Intelligent Platform.</span>
          </h1>
          <p className="mt-3 hidden max-w-md text-base text-ink-500 sm:block">Secure access to your digital asset ecosystem.</p>
        </div>
      </section>

      {/* Sign-in panel */}
      <section className="relative flex items-center justify-center px-5 pb-12 pt-6 sm:px-8 lg:bg-surface/60 lg:px-10 lg:shadow-[inset_1px_0_0_rgba(255,255,255,0.06)] lg:backdrop-blur-xl">
        <div className="w-full max-w-sm">
          <div className="mb-8 hidden items-center gap-3 lg:flex">
            <img src="/assets/logo-mark.svg" alt="" className="h-10 w-10" />
            <div>
              <div className="text-base font-bold text-white">IT Asset DPP</div>
              <div className="text-xs text-cyan-glow/80">Digital Product Passport</div>
            </div>
          </div>

          <div className="card-glow p-6 sm:p-7">
            <h2 className="text-xl font-semibold text-white">Sign in</h2>
            <p className="mb-6 mt-1 text-sm text-ink-400">Use the email and password your administrator gave you.</p>

            {notice && (
              <div role="status" className="mb-4 flex gap-2 rounded-lg bg-sky-500/10 px-3 py-2.5 text-sm text-sky-200 ring-1 ring-inset ring-sky-400/25">
                <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            {error && (
              <div id={errorId} role="alert" className="mb-4 flex gap-2 rounded-lg bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200 ring-1 ring-inset ring-rose-400/25">
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-describedby={error ? errorId : undefined}>
              <div>
                <label htmlFor={emailId} className="label">
                  Email address
                </label>
                <div className="relative">
                  <input
                    id={emailId}
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    className={`input pl-3 ${fieldErrors.email ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/25' : ''}`}
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={fieldErrors.email ? 'true' : undefined}
                    aria-describedby={fieldErrors.email ? `${emailId}-err` : undefined}
                    disabled={submitting}
                  />
                </div>
                {fieldErrors.email && (
                  <p id={`${emailId}-err`} className="mt-1.5 text-xs text-rose-300">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={passwordId} className="label">
                  Password
                </label>
                <div className="relative">
                  <input
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className={`input pr-11 ${fieldErrors.password ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/25' : ''}`}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={fieldErrors.password ? 'true' : undefined}
                    aria-describedby={fieldErrors.password ? `${passwordId}-err` : undefined}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-400 hover:text-white"
                    disabled={submitting}
                  >
                    <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-5 w-5" />
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id={`${passwordId}-err`} className="mt-1.5 text-xs text-rose-300">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-ink-500">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-ink-300 bg-ink-100 text-brand-500 focus:ring-cyan-glow/40"
                    disabled={submitting}
                  />
                  Keep me signed in on this device
                </label>
                <button
                  type="button"
                  onClick={() => setResetInfo((v) => !v)}
                  className="font-medium text-cyan-glow hover:underline"
                  aria-expanded={resetInfo}
                >
                  Forgot password?
                </button>
              </div>

              {resetInfo && (
                <p role="note" className="rounded-lg bg-white/[0.03] px-3 py-2.5 text-xs leading-relaxed text-ink-500 ring-1 ring-inset ring-white/[0.06]">
                  Self-service password reset is not available in this deployment. Ask your IT administrator to reset your password.
                </p>
              )}

              <button type="submit" className="btn-primary h-11 w-full text-[15px]" disabled={submitting} aria-busy={submitting}>
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-ink-400">
            Sign-ins are rate-limited. Your session ends when you sign out or after the configured timeout.
          </p>
          <p className="mt-3 text-center text-sm text-ink-400">
            Verifying a scanned asset?{' '}
            <Link to="/verify" className="font-medium text-cyan-glow hover:underline">
              Open public verification
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
