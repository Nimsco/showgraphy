import { Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LoadingLine } from './components/ui';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from './pages/RecoveryPages';
import { JournalPage } from './pages/JournalPage';
import { CollectionDetailPage, CollectionsPage, SharedCollectionPage } from './pages/CollectionsPage';
import { DiscoverPage, LibraryPage, TitlePage } from './pages/CatalogPages';
import { InsightsPage, ProfilePage, SettingsPage } from './pages/AccountPages';

function ProtectedLayout() {
  const { user, ready } = useAuth();
  if (!ready) return <main className="route-loading"><LoadingLine /></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: window.location.pathname + window.location.search }} />;
  return <Outlet />;
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
        <Route path="settings" element={<SettingsPage />} />
        <Route path="title/:id" element={<TitlePage />} />
      </Route>
    </Route>
    <Route path="*" element={<MissingPage />} />
  </Routes></Suspense></BrowserRouter>;
}
