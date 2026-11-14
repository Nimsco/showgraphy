import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Button, LoadingLine } from './components/ui';
import { apiRequest } from './lib/api';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from './pages/RecoveryPages';
import { JournalPage } from './pages/JournalPage';
import { CollectionDetailPage, CollectionsPage, SharedCollectionPage } from './pages/CollectionsPage';
import { DiscoverPage, LibraryPage, TitlePage } from './pages/CatalogPages';
import { InsightsPage, ProfilePage, SettingsPage } from './pages/AccountPages';

const GlobalChatPage = lazy(() => import('./pages/ChatPage').then(({ GlobalChatPage: page }) => ({ default: page })));

function ProtectedLayout() {
  const { user, ready, restoreError, retryRestore } = useAuth();
  if (!ready) return <main className="route-loading"><LoadingLine /></main>;
  if (!user && restoreError) return <main className="route-loading"><section className="empty-state" role="alert"><h2>Showgraphy is reconnecting</h2><p>{restoreError}</p><p>Your browser could not confirm the saved session, so it has not been cleared.</p><Button variant="outline" onClick={() => void retryRestore()}>Retry connection</Button></section></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: window.location.pathname + window.location.search }} />;
  if (user.usernameSetupRequired) return <UsernameSetupDialog />;
  return <Outlet />;
}

function UsernameSetupDialog() {
  const { updateUser } = useAuth();
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = /^[a-z0-9_]{3,24}$/.test(username);

  useEffect(() => {
    if (!valid) { setAvailability('idle'); return; }
    let active = true;
    setAvailability('checking');
    const timer = window.setTimeout(() => {
      apiRequest<{ available: boolean }>(`/users/username-availability?username=${encodeURIComponent(username)}`)
        .then((result) => { if (active) setAvailability(result.available ? 'available' : 'taken'); })
        .catch(() => { if (active) setAvailability('error'); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [username, valid]);

  async function chooseUsername(event: FormEvent) {
    event.preventDefault();
    if (!valid || availability !== 'available' || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const result = await apiRequest<{ user: import('./types').User }>('/users/me/username', { method: 'PATCH', body: JSON.stringify({ username }) });
      updateUser(result.user);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'That username could not be saved.');
      setAvailability('taken');
    } finally { setSaving(false); }
  }

  return <div className="dialog-scrim username-onboarding"><section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="username-setup-title" aria-describedby="username-setup-copy"><p className="eyebrow">One last step</p><h1 id="username-setup-title">Choose your username.</h1><p id="username-setup-copy">This is how you’ll appear on Showgraphy. Your Google name won’t be used as your username.</p><form onSubmit={chooseUsername}><label htmlFor="new-username">Username</label><input id="new-username" autoFocus autoComplete="username" minLength={3} maxLength={24} value={username} onChange={(event) => { setUsername(event.target.value.toLowerCase()); setMessage(''); }} placeholder="letters, numbers, underscores" aria-describedby="username-hint username-status"/><small id="username-hint">3–24 characters. Letters, numbers, and underscores only.</small><p id="username-status" className={`username-status username-status--${availability}`} aria-live="polite">{availability === 'checking' ? 'Checking availability…' : availability === 'available' ? 'Username is available.' : availability === 'taken' ? 'That username is already taken.' : availability === 'error' ? 'Could not check right now. Try again.' : ''}</p>{message && <p className="form-alert" role="alert">{message}</p>}<Button type="submit" disabled={!valid || availability !== 'available' || saving}>{saving ? 'Saving…' : 'Continue to Showgraphy'}</Button></form></section></div>;
}

function MissingPage() {
  return <main className="not-found"><p className="eyebrow">Page not found</p><h1>This story went another way.</h1><p>The page may have moved, or the address may be incomplete.</p><a className="button button--outline" href="/">Return to Showgraphy</a></main>;
}

export function App() {
  return <BrowserRouter><Suspense fallback={<main className="route-loading"><LoadingLine /></main>}><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route path="/u/:username" element={<ProfilePage />} />
    <Route path="/s/:token" element={<SharedCollectionPage />} />
    <Route element={<ProtectedLayout />}>
      <Route path="/app" element={<AppShell />}>
        <Route index element={<JournalPage />} />
        <Route path="discover" element={<DiscoverPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="collections/:id" element={<CollectionDetailPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="chat" element={<GlobalChatPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="title/:id" element={<TitlePage />} />
      </Route>
    </Route>
    <Route path="*" element={<MissingPage />} />
  </Routes></Suspense></BrowserRouter>;
}
