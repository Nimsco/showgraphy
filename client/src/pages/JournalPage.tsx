import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Clock3, Film, Play, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingLine, MediaCard, PageHeading, Poster } from '../components/ui';
import { apiRequest, ApiError } from '../lib/api';
import type { LibraryEntry, Statistics } from '../types';

type LibraryResult = { items: LibraryEntry[]; total: number };

export function JournalPage() {
  const watching = useQuery({ queryKey: ['library', 'watching', 'journal'], queryFn: () => apiRequest<LibraryResult>('/library?status=watching&limit=3') });
  const completed = useQuery({ queryKey: ['library', 'completed', 'journal'], queryFn: () => apiRequest<LibraryResult>('/library?status=completed&limit=6&sort=updated') });
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => apiRequest<{ stats: Statistics }>('/stats') });
  const error = watching.error || completed.error || stats.error;

  if (watching.isLoading || stats.isLoading) return <div className="page-wrap"><LoadingLine /></div>;
  if (error instanceof ApiError && error.status === 401) return <div className="page-wrap"><EmptyState title="Your session needs a refresh" description="Sign in again to reopen your personal journal." action={<Link className="button button--outline" to="/login">Sign in <ArrowRight size={16} /></Link>} /></div>;
  if (error) return <div className="page-wrap"><EmptyState title="Your journal could not open" description={error instanceof Error ? error.message : 'Check the API connection and try again.'} action={<button className="button button--outline" onClick={() => { void watching.refetch(); void completed.refetch(); void stats.refetch(); }}>Try again</button>} /></div>;

  const active = watching.data?.items ?? [];
  const recent = completed.data?.items ?? [];
  const summary = stats.data?.stats;

  return <div className="page-wrap journal-page">
    <PageHeading eyebrow="Your watchline" title="A life, in titles." description="The stories you have seen, and where you left the ones still unfolding." action={<Link className="button button--outline" to="/app/discover">Find a title <ArrowRight size={15} /></Link>} />

    {active.length ? <section className="continue-section" aria-labelledby="continue-heading">
      <div className="section-topline"><div><p className="eyebrow">Pick up where you left off</p><h2 id="continue-heading">Continue the story</h2></div><Link className="inline-arrow" to="/app/library?status=watching">All in progress <ArrowRight size={15} /></Link></div>
      <div className="continue-grid">{active.map((entry) => {
        const title = entry.titleId;
        const total = title.totalEpisodes ?? 0;
        const progress = total ? Math.min(100, Math.round(entry.episodesWatched / total * 100)) : 0;
        return <article className="continue-feature" key={entry._id}>
          <Link to={`/app/title/${title._id}`} className="continue-art" aria-label={`Continue ${title.title}`} style={title.backdrop ? { backgroundImage: `url("${title.backdrop}")` } : undefined}>
            <Poster title={title} size="small" /><span className="play-orb"><Play size={17} fill="currentColor" /></span>
          </Link>
          <div className="continue-copy"><p className="eyebrow">{title.mediaType === 'series' ? 'Series in progress' : 'In progress'}</p><h3><Link to={`/app/title/${title._id}`}>{title.title}</Link></h3>
            {title.mediaType === 'series' && <p className="progress-label">{total ? `Episode ${entry.episodesWatched} of ${total}` : `${entry.episodesWatched} episodes watched`}</p>}
            <div className="progress-track" role="progressbar" aria-label={`${title.title} episode progress`} aria-valuenow={total ? entry.episodesWatched : 0} aria-valuemin={0} aria-valuemax={total || 100}><span style={{ width: `${total ? progress : entry.episodesWatched ? 12 : 0}%` }} /></div>
            <Link className="inline-arrow" to={`/app/title/${title._id}`}>Open title <ArrowRight size={14} /></Link>
          </div>
        </article>;
      })}</div>
    </section> : <section className="journal-start" aria-labelledby="journal-start-heading">
      <div className="journal-start__text"><p className="eyebrow">The first entry</p><h2 id="journal-start-heading">Every watchline<br />begins <em>somewhere.</em></h2><p>Find a title, mark where you are, and your personal archive starts to take shape.</p><Link className="button button--primary" to="/app/discover">Find your first title <ArrowRight size={16} /></Link></div>
      <div className="journal-start__drawing" aria-hidden="true"><div className="journal-page-outline"><span /><span /><span /></div><div className="journal-line"><i /><i /><i /><i /></div><Sparkles size={19} /></div>
    </section>}

    <section className="journal-lower-grid">
      <div className="journal-recent">
        <div className="section-topline"><div><p className="eyebrow">Recently completed</p><h2>The pages you turned</h2></div>{recent.length > 0 && <Link className="inline-arrow" to="/app/library?status=completed">View library <ArrowRight size={14} /></Link>}</div>
        {recent.length > 0 ? <div className="media-grid media-grid--compact">{recent.slice(0, 4).map((entry) => <MediaCard key={entry._id} title={entry.titleId} meta={entry.completedAt ? new Date(entry.completedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : 'Completed'} to={`/app/title/${entry.titleId._id}`} />)}</div> : <EmptyState title="Your completed titles will gather here" description="When you finish something, add it to your library and it will become part of your watchline." action={<Link className="inline-arrow" to="/app/discover">Explore titles <ArrowRight size={15} /></Link>} icon={<BookOpen size={21} />} />}
      </div>
      <aside className="journal-note" aria-label="Archive summary">
        <div className="journal-note__icon"><Clock3 size={18} /></div>
        <p className="eyebrow">Your archive</p>
        <p className="journal-note__number">{summary?.total ?? 0}</p>
        <h2>{summary?.total === 1 ? 'title in your collection' : 'titles in your collection'}</h2>
        <p className="journal-note__detail"><Film size={15} /> {summary?.completed ?? 0} completed <span aria-hidden="true">·</span> {summary?.watching ?? 0} in progress</p>
        <Link className="inline-arrow" to="/app/insights">See your insights <ArrowRight size={14} /></Link>
      </aside>
    </section>
  </div>;
}
