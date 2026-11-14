import { useState, type FormEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, getApiBase } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Logo, Button, FieldError } from '../components/ui';

const loginSchema = z.object({ identifier: z.string().min(1, 'Enter your email or username.'), password: z.string().min(1, 'Enter your password.') });
const registerSchema = z.object({
  username: z.string().trim().toLowerCase().min(3, 'Use at least 3 characters.').max(24).regex(/^[a-z0-9_]+$/, 'Use letters, numbers, and underscores.'),
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const { user, login, register } = useAuth();
  const { verifyRegistration } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registrationEmail, setRegistrationEmail] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [registrationStarted, setRegistrationStarted] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const google = useQuery({ queryKey: ['auth-config'], queryFn: () => apiRequest<{ googleEnabled: boolean }>('/auth/config'), retry: false, staleTime: 60_000 });
  const loginForm = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });
  const submitting = isRegister ? registerForm.formState.isSubmitting : loginForm.formState.isSubmitting;

  if (user) return <Navigate to="/app" replace />;

  async function submitLogin(values: LoginValues) {
    setFormError('');
    try { await login(values); navigate((location.state as { from?: string } | null)?.from || '/app', { replace: true }); }
    catch (error) { setFormError(error instanceof Error ? error.message : 'Sign in could not be completed.'); }
  }

  async function submitRegister(values: RegisterValues) {
    setFormError('');
    try {
      const { confirmPassword: _confirmPassword, ...account } = values;
      await register(account);
      setRegistrationEmail(account.email);
      setRegistrationStarted(true);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Your account could not be created.'); }
  }

  async function submitRegistrationCode(event: FormEvent) {
    event.preventDefault(); setFormError(''); setVerifyingCode(true);
    try { await verifyRegistration(registrationEmail, registrationCode); navigate('/app', { replace: true }); }
    catch (error) { setFormError(error instanceof Error ? error.message : 'The code could not be verified.'); }
    finally { setVerifyingCode(false); }
  }

  return <main className="auth-page">
    <Link className="auth-back" to="/" aria-label="Back to Showgraphy"><ArrowLeft size={17} /><span>Showgraphy</span></Link>
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-story__art"><div className="story-frame story-frame--one" /><div className="story-frame story-frame--two" /><div className="story-frame story-frame--three"><span>S</span></div><span className="story-thread" /></div>
        <p className="eyebrow">A life, in titles</p>
        <h1>Keep the stories<br />that stayed <em>with you.</em></h1>
        <p>Your watch history, progress, and collections in one personal archive.</p>
      </section>
      <section className="auth-panel" aria-labelledby="auth-heading">
        <Logo />
        <p className="eyebrow">{isRegister ? 'Make room for the stories' : 'Welcome back to your archive'}</p>
        <h2 id="auth-heading">{isRegister ? 'Start your journal.' : 'Sign in.'}</h2>
        <p className="auth-panel__intro">{isRegister ? 'Your next watchline starts with one title.' : 'Your collection is waiting where you left it.'}</p>
        {formError && <p className="form-alert" role="alert">{formError}</p>}
        {isRegister && registrationStarted ? <form className="auth-form" onSubmit={submitRegistrationCode}>
          <p className="auth-panel__intro">Enter the six-digit code sent to <strong>{registrationEmail}</strong>. It expires in 10 minutes.</p>
          <label>Verification code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={registrationCode} onChange={(event) => setRegistrationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
          <Button type="submit" disabled={verifyingCode || registrationCode.length !== 6} className="auth-submit">{verifyingCode ? 'Verifying code…' : 'Verify and create account'} <ArrowRight size={16} /></Button>
        </form> : isRegister ? <form className="auth-form" onSubmit={registerForm.handleSubmit(submitRegister)} noValidate>
          <label>Username<input autoComplete="username" {...registerForm.register('username')} placeholder="yourname" /> <FieldError>{registerForm.formState.errors.username?.message}</FieldError></label>
          <label>Email<input type="email" autoComplete="email" {...registerForm.register('email')} placeholder="you@example.com" /> <FieldError>{registerForm.formState.errors.email?.message}</FieldError></label>
          <label>Password<span className="password-input"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...registerForm.register('password')} placeholder="At least 8 characters" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span><FieldError>{registerForm.formState.errors.password?.message}</FieldError></label>
          <label>Confirm password<input type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...registerForm.register('confirmPassword')} placeholder="Enter your password again" /><FieldError>{registerForm.formState.errors.confirmPassword?.message}</FieldError></label>
          <Button type="submit" disabled={submitting} className="auth-submit">{submitting ? 'Sending verification code…' : 'Continue with email'} <ArrowRight size={16} /></Button>
        </form> : <form className="auth-form" onSubmit={loginForm.handleSubmit(submitLogin)} noValidate>
          <label>Email or username<input autoComplete="username" {...loginForm.register('identifier')} placeholder="you@example.com" /><FieldError>{loginForm.formState.errors.identifier?.message}</FieldError></label>
          <label>Password<span className="password-input"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...loginForm.register('password')} placeholder="Your password" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span><FieldError>{loginForm.formState.errors.password?.message}</FieldError></label>
          <Link className="password-forgot" to="/forgot-password">Forgot your password?</Link>
          <Button type="submit" disabled={submitting} className="auth-submit">{submitting ? 'Opening your archive…' : 'Sign in'} <ArrowRight size={16} /></Button>
        </form>}
        <div className="auth-divider"><span>or</span></div>
        <a className={`google-button${!google.data?.googleEnabled ? ' is-disabled' : ''}`} href={google.data?.googleEnabled ? `${getApiBase()}/auth/google` : undefined} aria-disabled={!google.data?.googleEnabled} onClick={(event) => { if (!google.data?.googleEnabled) event.preventDefault(); }}><span className="google-g">G</span>{google.data?.googleEnabled ? 'Continue with Google' : 'Google sign-in is not configured'}{google.data?.googleEnabled && <Check size={14} className="google-check" />}</a>
        <p className="auth-switch">{isRegister ? 'Already have a journal?' : 'New to Showgraphy?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p>
        <p className="auth-terms">By continuing, you agree to keep your account details accurate and respect the privacy choices of other viewers.</p>
      </section>
    </div>
  </main>;
}
