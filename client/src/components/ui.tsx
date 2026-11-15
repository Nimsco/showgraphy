import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, Search, X } from 'lucide-react';
import type { MediaTitle } from '../types';

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return <span className={`brand-mark ${compact ? 'brand-mark--compact' : ''} ${light ? 'brand-mark--light' : ''}`}>
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="7" y="9" width="22" height="26" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="12" y="5" width="22" height="26" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" opacity=".6" />
      <path d="M11 27c3.2-4.5 6-7 9-7 3.1 0 5.1 4.4 8.4 4.4" fill="none" stroke="var(--secondary)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
    {!compact && <span className="brand-word">showgraphy</span>}
  </span>;
}

export function Button({ className = '', variant = 'primary', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'quiet' | 'danger' }) {
  return <button className={`button button--${variant} ${className}`} {...props}>{children}</button>;
}

export function Poster({ title, size = 'normal' }: { title: Pick<MediaTitle, 'title' | 'poster' | 'mediaType'>; size?: 'normal' | 'small' | 'large' }) {
  return <span className={`poster poster--${size}`}>
    {title.poster ? <img src={title.poster} alt={`${title.title} poster`} loading="lazy" /> : <span className="poster-fallback"><ImageOff size={18} aria-hidden="true" /><span>{title.title.slice(0, 1).toUpperCase()}</span></span>}
  </span>;
}

export function MediaCard({ title, meta, to, trailing }: { title: Pick<MediaTitle, 'title' | 'poster' | 'mediaType' | 'releaseDate' | 'communityRating' | 'communityRatingCount' | 'anilistAverageScore'>; meta?: string; to?: string; trailing?: ReactNode }) {
  return <article className="media-card">
    {to ? <Link to={to} className="poster-link" aria-label={`Open ${title.title}`}><Poster title={title} /></Link> : <Poster title={title} />}
    <div className="media-card__body">
      <div className="media-card__title-row"><h3>{to ? <Link to={to}>{title.title}</Link> : title.title}</h3>{trailing}</div>
      <p className="media-card__meta">{meta || [title.releaseDate?.slice(0, 4), title.mediaType === 'movie' ? 'Film' : 'Series'].filter(Boolean).join(' · ')}</p>
      {title.communityRatingCount ? <p className="media-card__rating"><span aria-label="Community rating">Showgraphy</span> {title.communityRating?.toFixed(2)} <span className="rating-count">({title.communityRatingCount})</span></p> : null}
      {title.anilistAverageScore != null ? <p className="media-card__rating"><span>AniList</span> {title.anilistAverageScore}/100</p> : null}
    </div>
  </article>;
}

export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <section className="empty-state">
    <div className="empty-state__art" aria-hidden="true">{icon || <Search size={22} strokeWidth={1.6} />}</div>
    <h2>{title}</h2>
    <p>{description}</p>
    {action && <div className="empty-state__action">{action}</div>}
  </section>;
}

export function LoadingLine({ label = 'Loading your journal' }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="loading-dot" />{label}</div>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading">
    <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>
    {action && <div className="page-heading__action">{action}</div>}
  </div>;
}

export function FieldError({ children }: { children?: ReactNode }) {
  return children ? <p className="field-error" role="alert">{children}</p> : null;
}

export function ConfirmDialog({ open, title, description, eyebrow = 'Please confirm', confirmLabel = 'Confirm', variant = 'danger', busy = false, error, onCancel, onConfirm }: {
  open: boolean;
  title: string;
  description: ReactNode;
  eyebrow?: string;
  confirmLabel?: string;
  variant?: 'primary' | 'danger';
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section className="dialog-panel confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}><div className="dialog-header"><div><p className="eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div><button type="button" className="icon-button" aria-label="Close confirmation" disabled={busy} onClick={onCancel}><X size={18} /></button></div><p className="dialog-intro" id={descriptionId}>{description}</p>{error && <p className="form-alert" role="alert">{error}</p>}<div className="dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button><Button type="button" variant={variant} disabled={busy} onClick={onConfirm}>{busy ? 'Please wait…' : confirmLabel}</Button></div></section></div>;
}
