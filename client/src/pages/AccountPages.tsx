import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, Check, Copy, Eye, LockKeyhole, Mail, Monitor, Share2, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, LoadingLine, MediaCard, PageHeading, Poster } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { themeGroups, useTheme } from '../contexts/ThemeContext';
import { apiRequest } from '../lib/api';
import type { LibraryEntry, Statistics, User as UserType } from '../types';

type Session = { id: string; current: boolean; userAgent: string; createdAt: string; lastUsedAt: string };
type ProfileMedia = { _id: string; title: string; poster: string; mediaType: 'movie' | 'series'; releaseDate?: string; communityRating?: number; communityRatingCount?: number };
type ProfileResult = {
  profile: { username: string; avatar: string; bio: string; createdAt: string };
  stats?: Statistics;
  favorites?: ProfileMedia[];
  lists?: Array<{ _id: string; name: string; slug: string; description: string; orderedItems: Array<{ titleId: ProfileMedia }> }>;
  recent?: Array<{ status: string; completedAt?: string; titleId: ProfileMedia }>;
  ratings?: Array<{ rating: number; updatedAt: string; titleId: ProfileMedia }>;
};

const insightCategories = [
  { key: 'movies', label: 'Movies' },
  { key: 'tv-shows', label: 'Series' },
  { key: 'k-dramas', label: 'K-drama' },
  { key: 'c-dramas', label: 'C-drama' },
  { key: 'j-dramas', label: 'J-drama' },
  { key: 'thai-dramas', label: 'Thai drama' },
  { key: 'anime', label: 'Anime' },
] as const;

function imageColors() {
  const root = getComputedStyle(document.documentElement);
  const read = (name: string) => root.getPropertyValue(name).trim();
  return {
    bg: read('--bg'), surface: read('--surface'), ink: read('--ink'), ink2: read('--ink-2'),
    ink3: read('--ink-3'), line: read('--line'), primary: read('--primary'), secondary: read('--secondary'),
    display: read('--font-display'), text: read('--font-text'),
  };
}

async function createInsightsImage(stats: Statistics, username: string) {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1560;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare the image.');
  const colors = imageColors();
  const number = (value: number) => value.toLocaleString();
  const categories = new Map(stats.byCategory.map((category) => [category.category, category.count]));
  const monthHeadingY = 1072 + Math.ceil(insightCategories.length / 2) * 82 + 50;
  const monthRows = Math.ceil(stats.byMonth.length / 6);
  canvas.height = Math.max(1560, monthHeadingY + (stats.byMonth.length ? 28 + monthRows * 62 : 0) + 110);

  context.fillStyle = colors.bg;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = colors.primary;
  context.fillRect(72, 66, 8, 42);
  context.font = `700 26px ${colors.text}`;
  context.fillStyle = colors.ink;
  context.fillText('showgraphy', 100, 96);
  context.font = `600 15px ${colors.text}`;
  context.fillStyle = colors.ink2;
  context.fillText(`@${username}  ·  PERSONAL VIEWING RECAP`, 72, 151);
  context.font = `500 110px ${colors.display}`;
  context.fillStyle = colors.ink;
  context.fillText(number(stats.completed), 72, 285);
  context.font = `600 19px ${colors.text}`;
  context.fillStyle = colors.primary;
  context.fillText('TITLES COMPLETED', 77, 328);
  context.font = `400 22px ${colors.text}`;
  context.fillStyle = colors.ink2;
  context.fillText(`${number(stats.completedMovies)} movies  ·  ${number(stats.completedSeries)} series`, 72, 378);
  context.strokeStyle = colors.line;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(72, 418);
  context.lineTo(1128, 418);
  context.stroke();

  const facts = [
    { label: 'In library', value: number(stats.total) },
    { label: 'Movies', value: number(stats.movies) },
    { label: 'Series', value: number(stats.series) },
    { label: 'Watching', value: number(stats.watching) },
    { label: 'Planned', value: number(stats.planned) },
    { label: 'On hold', value: number(stats.onHold) },
    { label: 'Dropped', value: number(stats.dropped) },
    { label: 'Episodes watched', value: number(stats.episodes) },
  ];
  const cardWidth = 336;
  const cardHeight = 142;
  const columnGap = 24;
  const rowGap = 20;
  facts.forEach((fact, index) => {
    const x = 72 + (index % 3) * (cardWidth + columnGap);
    const y = 456 + Math.floor(index / 3) * (cardHeight + rowGap);
    context.fillStyle = colors.surface;
    context.fillRect(x, y, cardWidth, cardHeight);
    context.strokeStyle = colors.line;
    context.strokeRect(x + 0.5, y + 0.5, cardWidth - 1, cardHeight - 1);
    context.font = `500 44px ${colors.display}`;
    context.fillStyle = colors.ink;
    context.fillText(fact.value, x + 24, y + 68, cardWidth - 48);
    context.font = `500 16px ${colors.text}`;
    context.fillStyle = colors.ink2;
    context.fillText(fact.label, x + 24, y + 108);
  });

  context.font = `500 31px ${colors.display}`;
  context.fillStyle = colors.ink;
  context.fillText('Titles by category', 72, 1003);
  context.font = `400 15px ${colors.text}`;
  context.fillStyle = colors.ink3;
  context.fillText('A title can appear in more than one category.', 72, 1032);
  const categoryWidth = 516;
  insightCategories.forEach((category, index) => {
    const x = 72 + (index % 2) * (categoryWidth + 24);
    const y = 1072 + Math.floor(index / 2) * 82;
    const count = categories.get(category.key) ?? 0;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(x, y + 56);
    context.lineTo(x + categoryWidth, y + 56);
    context.stroke();
    context.font = `500 19px ${colors.text}`;
    context.fillStyle = colors.ink2;
    context.fillText(category.label, x, y + 30);
    context.font = `500 25px ${colors.display}`;
    context.fillStyle = colors.ink;
    context.textAlign = 'right';
    context.fillText(number(count), x + categoryWidth, y + 31);
    context.textAlign = 'left';
  });

  const monthColumns = 6;
  const monthWidth = 164;
  const monthGap = 12;
  if (stats.byMonth.length) {
    context.font = `500 31px ${colors.display}`;
    context.fillStyle = colors.ink;
    context.fillText('Monthly completions', 72, monthHeadingY);
  }
  stats.byMonth.forEach((item, index) => {
    const x = 72 + (index % monthColumns) * (monthWidth + monthGap);
    const y = monthHeadingY + 28 + Math.floor(index / monthColumns) * 62;
    context.strokeStyle = colors.line;
    context.beginPath();
    context.moveTo(x, y + 44);
    context.lineTo(x + monthWidth, y + 44);
    context.stroke();
    context.font = `500 14px ${colors.text}`;
    context.fillStyle = colors.ink2;
    context.fillText(new Date(`${item.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), x, y + 26);
    context.font = `500 20px ${colors.display}`;
    context.fillStyle = colors.ink;
    context.textAlign = 'right';
    context.fillText(number(item.count), x + monthWidth, y + 26);
    context.textAlign = 'left';
  });

  const footerY = canvas.height - 66;
  context.strokeStyle = colors.line;
  context.beginPath();
  context.moveTo(72, footerY);
  context.lineTo(1128, footerY);
  context.stroke();
  context.fillStyle = colors.secondary;
  context.fillRect(72, footerY + 33, 24, 3);
  context.font = `500 14px ${colors.text}`;
  context.fillStyle = colors.ink3;
  context.fillText('Made from your Showgraphy library', 108, footerY + 40);
  context.font = `500 14px ${colors.text}`;
  context.textAlign = 'right';
  context.fillText(new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), 1128, footerY + 40);
  context.textAlign = 'left';

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Your browser could not export the image.');
  return new File([blob], `showgraphy-insights-${username}.png`, { type: 'image/png' });
}

export function InsightsPage() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['stats'], queryFn: () => apiRequest<{ stats: Statistics }>('/stats') });
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareError, setShareError] = useState('');
  const stats = query.data?.stats;
  const maxMonth = Math.max(1, ...((stats?.byMonth ?? []).map((item) => item.count)));
  const monthDescription = useMemo(() => (stats?.byMonth ?? []).map((item) => `${item.month}: ${item.count}`).join(', '), [stats?.byMonth]);
  async function shareAsImage() {
    if (!stats) return;
    setSharing(true);
    setShareMessage('');
    setShareError('');
    try {
      const file = await createInsightsImage(stats, user?.username ?? 'viewer');
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'My Showgraphy viewing recap', text: 'My viewing stats from Showgraphy.', files: [file] });
        setShareMessage('Your viewing recap was shared.');
      } else {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setShareMessage('Your viewing recap image was downloaded and is ready to share.');
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setShareError(cause instanceof Error ? cause.message : 'The viewing recap image could not be created.');
    } finally { setSharing(false); }
  }
  if (query.isLoading) return <div className="page-wrap"><LoadingLine label="Gathering your history" /></div>;
  if (query.error) return <div className="page-wrap"><EmptyState title="Insights could not load" description={query.error instanceof Error ? query.error.message : 'Try again shortly.'} action={<Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>} /></div>;
  return <div className="page-wrap insights-page">
    <PageHeading eyebrow="An account of what you watched" title="Your viewing, in context." description="Every total here comes from titles you added to your own library." action={<Button variant="outline" onClick={() => void shareAsImage()} disabled={sharing || !stats?.total}><Share2 size={16} />{sharing ? 'Preparing image…' : 'Share as image'}</Button>} />
    {(shareMessage || shareError) && <p className={shareError ? 'form-alert' : 'success-banner'} role={shareError ? 'alert' : 'status'}>{shareError || shareMessage}<button aria-label="Dismiss message" onClick={() => { setShareMessage(''); setShareError(''); }}><X size={15} /></button></p>}
    {stats?.total ? <>
      <section className="insight-lead"><div><p className="eyebrow">Across your collection</p><strong>{stats.completed}</strong><span>{stats.completed === 1 ? 'title completed' : 'titles completed'}</span></div><p>{stats.completedMovies} movies and {stats.completedSeries} series completed. Your library holds {stats.movies} movies and {stats.series} series across {stats.total} titles.</p></section>
      <section className="stats-facts" aria-label="Watch status totals">
        <article><span>Movies completed</span><strong>{stats.completedMovies}</strong></article><article><span>Series completed</span><strong>{stats.completedSeries}</strong></article><article><span>Watching</span><strong>{stats.watching}</strong></article><article><span>Plan to watch</span><strong>{stats.planned}</strong></article><article><span>On hold</span><strong>{stats.onHold}</strong></article><article><span>Dropped</span><strong>{stats.dropped}</strong></article><article><span>Episodes watched</span><strong>{stats.episodes}</strong></article><article><span>Titles in library</span><strong>{stats.total}</strong></article>
      </section>
      {stats.byMonth.length ? <section className="chart-section"><div className="section-topline"><div><p className="eyebrow">Completed over time</p><h2>Your watchline, month by month</h2></div><span className="chart-note">Based on completion dates</span></div><div className="month-chart" role="img" aria-label={`Completed titles per month: ${monthDescription}`}>
        {stats.byMonth.map((item) => <div className="month-chart__column" key={item.month}><div className="month-chart__bar-wrap"><span className="month-chart__value" style={{ bottom: `calc(${Math.max(8, item.count / maxMonth * 100)}% + 7px)` }}>{item.count}</span><span className="month-chart__bar" style={{ height: `${Math.max(8, item.count / maxMonth * 100)}%` }} /></div><span className="month-chart__label">{new Date(`${item.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</span></div>)}
      </div></section> : <section className="chart-section"><EmptyState title="Your timeline will appear here" description="Finish a title and mark its completion date to start a month-by-month watchline." /></section>}
      <section className="category-breakdown"><div><p className="eyebrow">Across your library</p><h2>Titles by category</h2><p className="category-note">Some titles appear in more than one category. Counts include every title in your library.</p></div><ul>{insightCategories.map((category) => { const count = stats.byCategory.find((item) => item.category === category.key)?.count ?? 0; const maxCount = Math.max(1, ...stats.byCategory.map((item) => item.count)); return <li key={category.key}><span>{category.label}</span><strong>{count}</strong><span className="category-bar"><i style={{ width: `${Math.max(count ? 4 : 0, count / maxCount * 100)}%` }} /></span></li>; })}</ul></section>
    </> : <EmptyState title="Your insights start with a title" description="Add a few movies or series to your library. Your statistics will be calculated from your real viewing history." action={<Link className="button button--primary" to="/app/discover">Find a title <ArrowRight size={15} /></Link>} icon={<BarChart3 size={22} />} />}
  </div>;
}

export function SettingsPage() {
  const { user, updateUser, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [bio, setBio] = useState(user?.bio ?? '');
  const [privacy, setPrivacy] = useState(user?.privacySettings ?? { showStats: true, showLists: true, showRatings: true, showActivity: true, showFavorites: true });
  const [visibility, setVisibility] = useState(user?.profileVisibility ?? 'public');
  const [avatar, setAvatar] = useState('');
  const [favoriteTitleIds, setFavoriteTitleIds] = useState<string[]>(user?.favoriteTitleIds ?? []);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => apiRequest<{ items: Session[] }>('/auth/sessions') });
  const google = useQuery({ queryKey: ['auth-config'], queryFn: () => apiRequest<{ googleEnabled: boolean; emailEnabled: boolean }>('/auth/config') });
  const library = useQuery({ queryKey: ['library', 'favorite-picker'], queryFn: async () => {
    const first = await apiRequest<{ items: LibraryEntry[]; total: number }>('/library?limit=50&page=1&sort=title');
    const pageCount = Math.ceil(first.total / 50);
    const remaining = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => apiRequest<{ items: LibraryEntry[] }>(`/library?limit=50&page=${index + 2}&sort=title`)));
    return { items: [first, ...remaining].flatMap((page) => page.items) };
  } });

  useEffect(() => { if (user) { setBio(user.bio); setPrivacy(user.privacySettings); setVisibility(user.profileVisibility); setAvatar(user.avatar); setFavoriteTitleIds(user.favoriteTitleIds ?? []); } }, [user?.id]);
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setNotice(''); setError('');
    try { const result = await apiRequest<{ user: UserType }>('/users/me', { method: 'PATCH', body: JSON.stringify({ bio, avatar, profileVisibility: visibility, privacySettings: privacy, favoriteTitleIds }) }); updateUser(result.user); setNotice('Your profile and privacy choices were saved.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Settings could not be saved.'); }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault(); setError(''); setPasswordNotice('');
    try { const result = await apiRequest<{ message: string }>('/auth/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) }); setPasswordNotice(result.message); setCurrentPassword(''); setNewPassword(''); await client.invalidateQueries({ queryKey: ['sessions'] }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Password could not be changed.'); }
  }
  async function resendVerification() {
    setNotice(''); setError('');
    try { const result = await apiRequest<{ message: string }>('/auth/verify/resend', { method: 'POST' }); setNotice(result.message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'A verification link could not be sent.'); }
  }
  async function revokeSession(id: string) {
    try { await apiRequest(`/auth/sessions/${id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['sessions'] }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Session could not be revoked.'); }
  }
  async function deleteAccount() {
    try { await apiRequest<void>('/users/me', { method: 'DELETE' }); setDeleteOpen(false); navigate('/', { replace: true }); window.location.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Account could not be deleted.'); setDeleteOpen(false); }
  }
  async function signOut() {
    await logout();
    navigate('/', { replace: true });
  }

  return <div className="page-wrap settings-page">
    <PageHeading eyebrow="Your account" title="Keep it yours." description="Manage the details and privacy choices attached to your Showgraphy profile." />
    {(notice || error) && <p className={error ? 'form-alert' : 'success-banner'} role={error ? 'alert' : 'status'}>{error || notice}<button aria-label="Dismiss message" onClick={() => { setNotice(''); setError(''); }}><X size={15} /></button></p>}
    <form onSubmit={saveProfile} className="settings-form">
      <section className="settings-section"><div className="settings-section__intro"><UserRound size={19} /><div><h2>Profile details</h2><p>These details appear on your profile when you make it public.</p></div></div><div className="settings-section__content">
        <label>Username<input value={`@${user?.username ?? ''}`} readOnly /></label><label>Bio<textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={3} maxLength={280} placeholder="A few words about what you like to watch" /><span className="field-count">{bio.length} / 280</span></label><label>Profile image URL<input type="url" value={avatar} onChange={(event) => setAvatar(event.target.value)} placeholder="https://…" /></label>
        <label>Profile visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}><option value="public">Public</option><option value="private">Private</option></select></label><small className="profile-visibility-hint">Public lets anyone open your profile link. Private hides the profile from everyone except you. This does not expose your library; the switches below control which profile sections appear publicly.</small>
        <fieldset className="favorite-picker"><legend>Featured titles <small>Choose up to 10 · {favoriteTitleIds.length}/10 selected</small></legend>{library.data?.items.length ? library.data.items.map((entry) => <label key={entry.titleId._id}><input type="checkbox" checked={favoriteTitleIds.includes(entry.titleId._id)} disabled={!favoriteTitleIds.includes(entry.titleId._id) && favoriteTitleIds.length >= 10} onChange={(event) => setFavoriteTitleIds((value) => event.target.checked ? [...value, entry.titleId._id] : value.filter((id) => id !== entry.titleId._id))} /><span>{entry.titleId.title}</span></label>) : <p className="quiet-line">Add titles to your library to choose profile favorites.</p>}</fieldset>
        <Link className="inline-arrow" to={`/u/${user?.username}`}>Preview your profile <ArrowRight size={14} /></Link>
      </div></section>
      <section className="settings-section"><div className="settings-section__intro"><Eye size={19} /><div><h2>What others can see</h2><p>Private profiles are visible only to you. On public profiles, each section can be hidden here.</p></div></div><div className="settings-section__content privacy-toggles">
        {([{ key: 'showStats', label: 'Viewing statistics', text: 'Totals and category counts' }, { key: 'showLists', label: 'Public collections', text: 'Collections marked public' }, { key: 'showRatings', label: 'Your ratings', text: 'Scores you have submitted' }, { key: 'showActivity', label: 'Recent activity', text: 'Titles marked completed' }, { key: 'showFavorites', label: 'Top 10 titles', text: 'Titles you chose to feature' }] as const).map((item) => <label className="privacy-toggle" key={item.key}><span><strong>{item.label}</strong><small>{item.text}</small></span><input type="checkbox" checked={privacy[item.key]} onChange={(event) => setPrivacy((value) => ({ ...value, [item.key]: event.target.checked }))} /><span className="switch-ui" aria-hidden="true" /></label>)}
      </div></section>
      <section className="settings-section"><div className="settings-section__intro"><Monitor size={19} /><div><h2>Appearance</h2><p>Choose a clear light palette or a dark palette with restrained accent colors. Your selection follows this account on your other devices.</p></div></div><fieldset className="settings-section__content theme-picker"><legend className="visually-hidden">Color theme</legend>{themeGroups.map((group) => <div className="theme-group" key={group.label}><h3>{group.label}</h3><div className="theme-group__options">{group.options.map((theme) => <label className={`theme-choice${preference === theme.value ? ' is-selected' : ''}`} key={theme.value} data-theme-swatch={theme.value}><input type="radio" name="themePreference" value={theme.value} checked={preference === theme.value} onChange={() => setPreference(theme.value)} /><span className="theme-choice__palette" aria-hidden="true"><i /><i /><i /></span><span className="theme-choice__label">{theme.label}</span></label>)}</div></div>)}</fieldset></section>
      <div className="settings-save"><span><ShieldCheck size={16} /> Theme saves automatically. Profile and privacy changes save with this button.</span><Button type="submit"><Check size={15} /> Save settings</Button></div>
    </form>
    <section className="settings-section password-section"><div className="settings-section__intro"><LockKeyhole size={19} /><div><h2>Password</h2><p>Use a new password with at least 8 characters.</p></div></div><form className="settings-section__content password-form" onSubmit={changePassword}><label>Current password<input type="password" autoComplete="current-password" minLength={1} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label>New password<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><Button type="submit" variant="outline">Update password</Button>{passwordNotice && <p className="success-inline" role="status">{passwordNotice}</p>}</form></section>
    <section className="settings-section"><div className="settings-section__intro"><Mail size={19} /><div><h2>Email address</h2><p>{user?.email}{user?.emailVerified ? ' · Verified' : ' · Not verified'}</p></div></div><div className="settings-section__content connection-row">{user?.emailVerified ? <strong className="verified-label"><Check size={14} /> Verified</strong> : <><span>{google.data?.emailEnabled ? 'Confirm your address to keep account recovery available.' : 'Email delivery is not configured on the server yet.'}</span><Button type="button" variant="outline" disabled={!google.data?.emailEnabled} onClick={() => void resendVerification()}>Send verification link</Button></>}</div></section>
    <section className="settings-section"><div className="settings-section__intro"><Monitor size={19} /><div><h2>Active sessions</h2><p>Sign out devices you no longer use. Changing your password signs out other sessions.</p></div></div><div className="settings-section__content session-list">{sessions.isLoading ? <LoadingLine label="Checking active sessions" /> : sessions.error ? <p className="quiet-line">Active sessions could not load.</p> : sessions.data?.items.map((session) => <article className="session-row" key={session.id}><div><strong>{session.current ? 'This device' : session.userAgent.split(' ').slice(0, 3).join(' ') || 'Signed-in device'}</strong><span>{session.current ? 'Current session' : `Last active ${new Date(session.lastUsedAt).toLocaleDateString()}`}</span></div><button className="text-button" disabled={session.current} onClick={() => void revokeSession(session.id)}>{session.current ? 'Active' : 'Sign out'}</button></article>)}</div></section>
    <section className="settings-section"><div className="settings-section__intro"><ShieldCheck size={19} /><div><h2>Connected accounts</h2><p>Use Google sign-in to create or connect an account.</p></div></div><div className="settings-section__content connection-row"><span>Google sign-in</span><strong>{google.data?.googleEnabled ? 'Available' : 'Not configured by the server'}</strong></div></section>
    <section className="settings-section"><div className="settings-section__intro"><UserRound size={19} /><div><h2>Sign out</h2><p>End this session on the current device.</p></div></div><div className="settings-section__content"><Button variant="outline" onClick={() => void signOut()}>Sign out of Showgraphy</Button></div></section>
    <section className="settings-section danger-zone"><div className="settings-section__intro"><Trash2 size={19} /><div><h2>Delete account</h2><p>Delete your profile, collections, library entries, ratings, and sessions.</p></div></div><div className="settings-section__content"><Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete my account</Button></div></section>
    {deleteOpen && <div className="dialog-scrim" role="presentation"><section className="dialog-panel confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title"><div className="dialog-header"><div><p className="eyebrow">This cannot be undone</p><h2 id="delete-account-title">Delete your account?</h2></div><button className="icon-button" aria-label="Close confirmation" onClick={() => setDeleteOpen(false)}><X size={18} /></button></div><p>Your personal library, custom lists, ratings, and active share links will be removed. Catalog titles remain available to other viewers.</p><div className="dialog-actions"><Button variant="outline" onClick={() => setDeleteOpen(false)}>Keep my account</Button><Button variant="danger" onClick={() => void deleteAccount()}>Delete account</Button></div></section></div>}
    <p className="settings-join"><CalendarDays size={14} /> Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'today'}</p>
  </div>;
}

export function ProfilePage() {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const [copyNotice, setCopyNotice] = useState('');
  const ownProfile = user?.username.toLowerCase() === username.toLowerCase();
  const query = useQuery({ queryKey: ['profile', username], queryFn: () => apiRequest<ProfileResult>(`/users/profiles/${encodeURIComponent(username)}`), retry: false });
  async function copyProfileLink() {
    try {
      const profileLink = new URL(`/u/${encodeURIComponent(username)}`, window.location.origin).toString();
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(profileLink); copied = true; } catch { /* Fall back for browsers that block clipboard access. */ }
      }
      if (!copied) {
        const field = document.createElement('textarea');
        field.value = profileLink;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        try { copied = document.execCommand('copy'); }
        finally { field.remove(); }
      }
      if (!copied) throw new Error('The profile link could not be copied.');
      setCopyNotice('Profile link copied.');
      window.setTimeout(() => setCopyNotice(''), 2400);
    } catch (cause) {
      setCopyNotice(cause instanceof Error ? cause.message : 'The profile link could not be copied.');
    }
  }
  if (query.isLoading) return <div className="page-wrap"><LoadingLine label="Opening profile" /></div>;
  if (query.error || !query.data) return <main className="page-wrap"><EmptyState title="This profile is private or unavailable" description={query.error instanceof Error ? query.error.message : 'Check the profile link, or ask the viewer to make it public.'} action={<Link className="button button--outline" to="/">Go to Showgraphy</Link>} /></main>;
  const { profile, stats, favorites, lists, recent, ratings } = query.data;

  return <main className="profile-page">
    <div className="profile-topbar"><Link to={ownProfile ? '/app' : '/'} className="inline-arrow"><ArrowLeft size={15} /> {ownProfile ? 'Back to your journal' : 'Showgraphy'}</Link>{ownProfile && <div className="profile-topbar__actions">{user?.profileVisibility === 'public' && <><Button type="button" variant="outline" onClick={() => void copyProfileLink()}><Copy size={15} /> Copy profile link</Button>{copyNotice && <span className="profile-copy-status" role="status">{copyNotice}</span>}</>}<Link className="button button--outline" to="/app/settings">Edit profile</Link></div>}</div>
    <header className="profile-masthead"><div className="profile-avatar">{profile.avatar ? <img src={profile.avatar} alt="" /> : <UserRound size={29} strokeWidth={1.3} />}</div><div><p className="eyebrow">A personal watchline</p><h1>@{profile.username}</h1><p className="profile-handle">Joined {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>{profile.bio && <p className="profile-bio">{profile.bio}</p>}</div></header>
    {stats && <section className="profile-stats"><div><strong>{stats.completed}</strong><span>completed</span></div><div><strong>{stats.movies}</strong><span>films</span></div><div><strong>{stats.series}</strong><span>series</span></div><div><strong>{stats.total}</strong><span>titles in library</span></div></section>}
    {stats && <section className="profile-category-stats" aria-label="Titles by category"><div><p className="eyebrow">Across the library</p><h2>By type</h2><p>Counts include titles at every watch status.</p></div><ul>{insightCategories.map((category) => <li key={category.key}><span>{category.label}</span><strong>{stats.byCategory.find((item) => item.category === category.key)?.count ?? 0}</strong></li>)}</ul></section>}
    {favorites?.length ? <section className="profile-section"><div className="section-topline"><div><p className="eyebrow">Featured by @{profile.username}</p><h2>{profile.username}'s top 10</h2></div></div><div className="media-grid media-grid--compact">{favorites.map((title) => <article className="media-card" key={title._id}><Poster title={title} /><div className="media-card__body"><h3>{title.title}</h3><p className="media-card__meta">{title.releaseDate?.slice(0, 4)} · {title.mediaType}</p></div></article>)}</div></section> : null}
    {recent?.length ? <section className="profile-section"><div className="section-topline"><div><p className="eyebrow">The latest pages</p><h2>Recently completed</h2></div></div><div className="media-grid media-grid--compact">{recent.map((entry, index) => <MediaCard key={`${entry.titleId._id}-${index}`} title={entry.titleId} meta={entry.completedAt ? new Date(entry.completedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : 'Completed'} />)}</div></section> : null}
    {lists?.length ? <section className="profile-section"><div className="section-topline"><div><p className="eyebrow">Kept together</p><h2>Public collections</h2></div></div><div className="profile-lists">{lists.map((list) => <article key={list._id}><h3>{list.name}</h3><p>{list.description || `${list.orderedItems.length} titles`}</p><span>{list.orderedItems.length} {list.orderedItems.length === 1 ? 'title' : 'titles'}</span></article>)}</div></section> : null}
    {ratings?.length ? <section className="profile-section"><div className="section-topline"><div><p className="eyebrow">Personal scores</p><h2>Ratings</h2></div></div><div className="rating-history">{ratings.map((entry, index) => <article key={`${entry.titleId._id}-${index}`}><Poster title={entry.titleId} size="small" /><div><h3>{entry.titleId.title}</h3><p>Rated {new Date(entry.updatedAt).toLocaleDateString()}</p></div><strong>{entry.rating.toFixed(1)}<small> / 10</small></strong></article>)}</div></section> : null}
    {!stats && !recent?.length && !lists?.length && <EmptyState title="A watchline takes shape over time" description={`@${profile.username} has not made public sections available yet.`} />}
    <footer className="profile-footer"><span>showgraphy</span><span>A personal record of what moved you.</span></footer>
  </main>;
}
