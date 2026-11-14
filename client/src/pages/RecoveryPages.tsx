import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Mail, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Logo } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';

function RecoveryLayout({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <main className="auth-page"><Link className="auth-back" to="/login"><ArrowLeft size={17} /><span>Back to sign in</span></Link><div className="auth-layout"><section className="auth-story"><div className="auth-story__art"><div className="story-frame story-frame--one" /><div className="story-frame story-frame--two" /><div className="story-frame story-frame--three"><Mail size={27} /></div><span className="story-thread" /></div><p className="eyebrow">A safe way back</p><h1>Your archive<br />is still <em>yours.</em></h1><p>Account links expire and can only be used once.</p></section><section className="auth-panel"><Logo /><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p className="auth-panel__intro">{description}</p>{children}<p className="auth-switch"><Link to="/login">Return to sign in <ArrowRight size={13} /></Link></p></section></div></main>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try { const result = await apiRequest<{ message: string }>('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }); setMessage(result.message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The request could not be sent.'); }
    finally { setBusy(false); }
  }
  return <RecoveryLayout eyebrow="Password recovery" title="Find your way back." description="Enter the email on your account. If it matches, we will send a one-use reset link.">
    {error && <p className="form-alert" role="alert">{error}</p>}{message && <p className="success-banner" role="status">{message}</p>}
    <form className="auth-form" onSubmit={submit}><label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send recovery link'} <ArrowRight size={16} /></Button></form>
  </RecoveryLayout>;
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (password !== confirm) { setError('Those passwords do not match.'); return; }
    setBusy(true);
    try { const result = await apiRequest<{ message: string }>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) }); setMessage(result.message); window.setTimeout(() => navigate('/login', { replace: true }), 1400); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The password could not be reset.'); }
    finally { setBusy(false); }
  }
  return <RecoveryLayout eyebrow="Choose a new password" title="Make a fresh start." description="Use at least 8 characters. Your other active sessions will be signed out.">
    {!token && <p className="form-alert" role="alert">This reset link is missing its token. Request a new one.</p>}{error && <p className="form-alert" role="alert">{error}</p>}{message && <p className="success-banner" role="status">{message}</p>}
    <form className="auth-form" onSubmit={submit}><label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label><Button type="submit" disabled={busy || !token}>{busy ? 'Updating…' : 'Reset password'} <ArrowRight size={16} /></Button></form>
  </RecoveryLayout>;
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { user, updateUser } = useAuth();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function verify() {
    setError(''); setBusy(true);
    try { await apiRequest<{ verified: boolean }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }); setStatus('Your email address is verified.'); if (user) updateUser({ ...user, emailVerified: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The email address could not be verified.'); }
    finally { setBusy(false); }
  }
  return <RecoveryLayout eyebrow="Email verification" title="Confirm it is yours." description="This one-use link expires after 24 hours.">
    {!token && <p className="form-alert" role="alert">This verification link is missing its token.</p>}{error && <p className="form-alert" role="alert">{error}</p>}{status && <p className="success-banner" role="status"><Check size={15} /> {status}</p>}
    <Button type="button" onClick={() => void verify()} disabled={!token || busy || Boolean(status)}>{busy ? 'Verifying…' : 'Verify email address'} <ShieldCheck size={16} /></Button>
  </RecoveryLayout>;
}
