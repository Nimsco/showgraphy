import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, Search } from 'lucide-react';
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
      {title.communityRatingCount ? <p className="media-card__rating"><span aria-label="Community rating">Showgraphy</span> {title.communityRating?.toFixed(1)} <span className="rating-count">({title.communityRatingCount})</span></p> : null}
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
