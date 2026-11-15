import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Film, Heart, MessageSquareText, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2, X } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button, ConfirmDialog, EmptyState, FieldError, LoadingLine, MediaCard, PageHeading, Poster } from '../components/ui';
import { apiRequest } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { LibraryEntry, MediaTitle, UserList, WatchStatus } from '../types';

const TitleDiscussions = lazy(() => import('./CommunityPages').then(({ TitleDiscussions: page }) => ({ default: page })));

type Page<T> = { items: T[]; total: number; page: number; limit: number };
type SearchResult = Page<MediaTitle> & { totalPages: number; providers: { tmdb: boolean; anilist: boolean }; searchConfigured: boolean };
const categories = ['movies', 'tv-shows', 'anime', 'k-dramas', 'c-dramas', 'j-dramas', 'thai-dramas', 'western-tv', 'documentaries', 'reality-shows', 'other'];
const statuses: Array<{ value: WatchStatus; label: string }> = [
  { value: 'completed', label: 'Completed' }, { value: 'watching', label: 'Watching' },
  { value: 'planned', label: 'Plan to watch' }, { value: 'on-hold', label: 'On hold' }, { value: 'dropped', label: 'Dropped' },
];

function titlePath(title: MediaTitle) { return `/app/title/${title._id}`; }
function ratingChoice(value: number | null | undefined) { return value == null ? '' : (Math.round(Math.min(10, Math.max(1, value)) * 2) / 2).toFixed(1); }
const ratingOptions = Array.from({ length: 19 }, (_, index) => (1 + index * 0.5).toFixed(1));

function PageControls({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  const firstVisible = Math.max(1, Math.min(page - 2, totalPages - 4));
  const lastVisible = Math.min(totalPages, firstVisible + 4);
  const pages = Array.from({ length: lastVisible - firstVisible + 1 }, (_, index) => firstVisible + index);
  return <nav className="page-controls" aria-label="Search result pages">
    <Button className="page-step" variant="outline" aria-label="Go to previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}><ArrowLeft size={14} /><span>Previous</span></Button>
    {firstVisible > 1 && <><button type="button" className="page-number" aria-label="Go to page 1" onClick={() => onChange(1)}>1</button>{firstVisible > 2 && <span className="page-ellipsis" aria-hidden="true">…</span>}</>}
    {pages.map((number) => <button type="button" key={number} className={`page-number${number === page ? ' is-current' : ''}`} aria-label={`Page ${number}`} aria-current={number === page ? 'page' : undefined} onClick={() => onChange(number)}>{number}</button>)}
    {lastVisible < totalPages && <>{lastVisible < totalPages - 1 && <span className="page-ellipsis" aria-hidden="true">…</span>}<button type="button" className="page-number" aria-label={`Go to page ${totalPages}`} onClick={() => onChange(totalPages)}>{totalPages}</button></>}
    <Button className="page-step" variant="outline" aria-label="Go to next page" disabled={page >= totalPages} onClick={() => onChange(page + 1)}><span>Next</span><ArrowRight size={14} /></Button>
  </nav>;
}

const manualSchema = z.object({
  title: z.string().trim().min(1, 'Add a title.').max(180),
  originalTitle: z.string().trim().max(180).optional(),
  mediaType: z.enum(['movie', 'series']),
  categories: z.array(z.string()).min(1, 'Choose at least one category.'),
  genresText: z.string().max(200).optional(),
  releaseDate: z.string().optional(),
  totalEpisodes: z.coerce.number().int().min(0).max(10000).optional(),
  synopsis: z.string().max(5000).optional(),
  poster: z.union([z.literal(''), z.url()]).optional(),
});
type ManualInput = z.input<typeof manualSchema>;
type ManualValues = z.output<typeof manualSchema>;

function ManualTitleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (title: MediaTitle) => void }) {
  const form = useForm<ManualInput, unknown, ManualValues>({ resolver: zodResolver(manualSchema), defaultValues: { mediaType: 'series', categories: ['tv-shows'], totalEpisodes: 0, synopsis: '', poster: '' } });
  const [requestError, setRequestError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggleCategory = (category: string) => {
    const selected = form.getValues('categories');
    form.setValue('categories', selected.includes(category) ? selected.filter((item) => item !== category) : [...selected, category], { shouldValidate: true });
  };
  async function submit(values: ManualValues) {
    setRequestError('');
    setBusy(true);
    try {
      const result = await apiRequest<{ item: MediaTitle }>('/catalog/manual', { method: 'POST', body: JSON.stringify({
        title: values.title,
        originalTitle: values.originalTitle || undefined,
        mediaType: values.mediaType,
        categories: values.categories,
        genres: values.genresText?.split(',').map((genre) => genre.trim()).filter(Boolean) ?? [],
        releaseDate: values.releaseDate || undefined,
        totalEpisodes: values.mediaType === 'series' ? values.totalEpisodes : undefined,
        synopsis: values.synopsis ?? '', poster: values.poster ?? '',
      }) });
      await apiRequest('/library', { method: 'POST', body: JSON.stringify({ titleId: result.item._id, status: 'planned' }) });
      onCreated(result.item);
    } catch (error) { setRequestError(error instanceof Error ? error.message : 'This title could not be added.'); }
    finally { setBusy(false); }
  }
  return <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="manual-title-heading">
      <div className="dialog-header"><div><p className="eyebrow">A title you know</p><h2 id="manual-title-heading">Add a title by hand</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
      <p className="dialog-intro">Manual details stay marked as yours. They do not replace verified catalog information.</p>
      {requestError && <p className="form-alert" role="alert">{requestError}</p>}
      <form className="manual-form" onSubmit={form.handleSubmit(submit)} noValidate>
        <label>Title<input autoFocus {...form.register('title')} placeholder="Title name" /><FieldError>{form.formState.errors.title?.message}</FieldError></label>
        <label>Original title, if different<input {...form.register('originalTitle')} placeholder="Original language title" /></label>
        <div className="form-two-col"><label>Format<select {...form.register('mediaType')}><option value="movie">Movie</option><option value="series">Series</option></select></label><label>Release date<input type="date" {...form.register('releaseDate')} /></label></div>
        {form.watch('mediaType') === 'series' && <label>Total episodes<input type="number" min={0} max={10000} {...form.register('totalEpisodes')} /></label>}
        <fieldset className="category-fieldset"><legend>Categories</legend><div className="category-checkboxes">{categories.map((category) => <label key={category}><input type="checkbox" checked={form.watch('categories').includes(category)} onChange={() => toggleCategory(category)} /><span>{category.replaceAll('-', ' ')}</span></label>)}</div><FieldError>{form.formState.errors.categories?.message}</FieldError></fieldset>
        <label>Genres, separated by commas<input {...form.register('genresText')} placeholder="Drama, mystery" /></label>
        <label>Poster URL, optional<input type="url" {...form.register('poster')} placeholder="https://…" /><FieldError>{form.formState.errors.poster?.message}</FieldError></label>
        <label>Short description<textarea rows={3} {...form.register('synopsis')} placeholder="What do you want to remember?" /></label>
        <div className="dialog-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Adding title…' : 'Add to watchlist'} <ArrowRight size={15} /></Button></div>
      </form>
    </section>
  </div>;
}

export function DiscoverPage() {
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('');
  const [debounced, setDebounced] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(term.trim()), 300); return () => window.clearTimeout(timer); }, [term]);
  useEffect(() => { setPage(1); }, [debounced, category]);
  const query = useQuery({
    queryKey: ['catalog-search', debounced, category, page],
    queryFn: () => apiRequest<SearchResult>(`/catalog/search?q=${encodeURIComponent(debounced)}${category ? `&category=${encodeURIComponent(category)}` : ''}&page=${page}`),
    enabled: debounced.length >= 2,
    retry: false,
  });
  const discoverQuery = useQuery({
    queryKey: ['catalog-discover', category, page],
    queryFn: () => apiRequest<SearchResult>(`/catalog/discover${category ? `?category=${encodeURIComponent(category)}&page=${page}` : `?page=${page}`}`),
    enabled: debounced.length < 2,
    retry: false,
  });
  const activeQuery = debounced.length >= 2 ? query : discoverQuery;
  const results = activeQuery.data?.items ?? [];
  return <div className="page-wrap catalog-page">
    <PageHeading eyebrow="Explore at your own pace" title="Find the next story." description="Search films, anime, dramas, and series. The catalog runs through configured providers, and you can add a title yourself if it is missing." action={<Button variant="outline" onClick={() => setManualOpen(true)}><Plus size={16} /> Add manually</Button>} />
    <section className="search-workspace" aria-label="Search the catalog">
      <form className="catalog-search" role="search" onSubmit={(event: FormEvent) => { event.preventDefault(); setDebounced(term.trim()); }}>
        <Search size={20} /><label className="visually-hidden" htmlFor="catalog-query">Search titles</label><input id="catalog-query" type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Title, original name, or language…" autoComplete="off" /><kbd>/</kbd>
        {term && <button type="button" aria-label="Clear search" onClick={() => { setTerm(''); setDebounced(''); }}><X size={17} /></button>}
      </form>
      <div className="filter-row"><span><SlidersHorizontal size={15} /> Filter by kind</span><div className="filter-chips"><button className={!category ? 'is-selected' : ''} onClick={() => setCategory('')}>Everything</button>{['movies', 'anime', 'k-dramas', 'c-dramas', 'j-dramas', 'documentaries'].map((item) => <button key={item} className={category === item ? 'is-selected' : ''} onClick={() => setCategory(category === item ? '' : item)}>{item.replaceAll('-', ' ')}</button>)}</div></div>
    </section>
    <div className="results-heading"><p>{debounced.length < 2 ? category ? `Trending ${category.replaceAll('-', ' ')}` : 'Popular this week' : activeQuery.isFetching ? 'Looking through the catalog…' : `${activeQuery.data?.items.length ?? 0} titles found`}</p>{activeQuery.data?.page && activeQuery.data.totalPages > 1 && <span>Page {activeQuery.data.page} of {activeQuery.data.totalPages}</span>}</div>
    {activeQuery.isLoading || activeQuery.isFetching ? <LoadingLine label={debounced.length < 2 ? 'Finding popular titles' : 'Searching the catalog'} /> : activeQuery.error ? <EmptyState title="The catalog is having trouble" description={activeQuery.error instanceof Error ? activeQuery.error.message : 'Try again in a moment, or add the title manually.'} action={<Button variant="outline" onClick={() => void activeQuery.refetch()}>Try again</Button>} /> : results.length ? <><div className="media-grid media-grid--search">{results.map((title) => <MediaCard title={title} key={title._id} to={titlePath(title)} />)}</div><PageControls page={activeQuery.data?.page ?? 1} totalPages={activeQuery.data?.totalPages ?? 1} onChange={setPage} /></> : <EmptyState title={activeQuery.data?.searchConfigured === false ? 'Catalog search is not configured' : debounced.length < 2 ? 'Nothing trending yet' : 'No titles matched that search'} description={activeQuery.data?.searchConfigured === false ? 'Configure the provider for this category on the server, or create a manual title and keep tracking.' : 'Try another language or a shorter title. You can also add a title manually.'} action={<Button onClick={() => setManualOpen(true)}><Plus size={16} /> Add a title manually</Button>} />}
    {manualOpen && <ManualTitleDialog onClose={() => setManualOpen(false)} onCreated={(title) => navigate(titlePath(title))} />}
  </div>;
}

function LibraryEntryCard({ entry, onChange, onRemove }: { entry: LibraryEntry; onChange: (entryId: string, body: Record<string, unknown>) => Promise<void>; onRemove: (entry: LibraryEntry) => Promise<void> }) {
  const completedEpisodes = entry.status === 'completed' && entry.titleId.mediaType === 'series' && entry.titleId.totalEpisodes ? entry.titleId.totalEpisodes : entry.episodesWatched;
  const [episodes, setEpisodes] = useState(completedEpisodes);
  const [message, setMessage] = useState('');
  useEffect(() => setEpisodes(completedEpisodes), [completedEpisodes]);
  async function saveProgress(event: FormEvent) {
    event.preventDefault();
    await onChange(entry._id, { episodesWatched: Number(episodes) });
    setMessage('Progress saved');
    window.setTimeout(() => setMessage(''), 2200);
  }
  return <article className="library-entry">
    <Link to={titlePath(entry.titleId)} className="library-entry__poster"><Poster title={entry.titleId} /></Link>
    <div className="library-entry__main"><div className="library-entry__heading"><div><p className="eyebrow">{entry.titleId.releaseDate?.slice(0, 4) || (entry.titleId.mediaType === 'movie' ? 'Movie' : 'Series')} · {entry.titleId.mediaType === 'movie' ? 'Film' : 'Series'}</p><h2><Link to={titlePath(entry.titleId)}>{entry.titleId.title}</Link></h2><p className="media-card__meta">{entry.titleId.categories?.map((item) => item.replaceAll('-', ' ')).join(' · ')}</p></div><label className="status-select-label"><span className="visually-hidden">Status for {entry.titleId.title}</span><select value={entry.status} onChange={(event) => void onChange(entry._id, { status: event.target.value })}>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label><Button type="button" variant="outline" className="library-remove" onClick={() => void onRemove(entry)} aria-label={`Remove ${entry.titleId.title} from your library`}><Trash2 size={14} /><span>Remove</span></Button></div>
      {entry.titleId.mediaType === 'series' && <form className="progress-edit" onSubmit={saveProgress}><label>Episodes watched <input type="number" min={0} max={entry.titleId.totalEpisodes || 10000} value={episodes} disabled={entry.status === 'completed'} onChange={(event) => setEpisodes(Number(event.target.value))} /></label>{entry.titleId.totalEpisodes ? <span>of {entry.titleId.totalEpisodes}</span> : null}{entry.status === 'completed' ? <span>Complete</span> : <Button type="submit" variant="outline"><Check size={14} /> Save progress</Button>}<span role="status">{message}</span></form>}
      {entry.notes && <p className="library-note">{entry.notes}</p>}
    </div>
  </article>;
}

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const initialStatus = params.get('status') || '';
  const [status, setStatus] = useState(initialStatus);
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const client = useQueryClient();
  const [changeError, setChangeError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<LibraryEntry | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  useEffect(() => { setStatus(params.get('status') || ''); }, [params]);
  useEffect(() => { setPage(1); }, [status, category, query]);
  const result = useQuery({ queryKey: ['library', status, category, query, page], queryFn: () => apiRequest<Page<LibraryEntry>>(`/library?limit=24&page=${page}${status ? `&status=${status}` : ''}${category ? `&category=${category}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`) });
  async function changeEntry(entryId: string, body: Record<string, unknown>) {
    try { setChangeError(''); await apiRequest(`/library/${entryId}`, { method: 'PATCH', body: JSON.stringify(body) }); await client.invalidateQueries({ queryKey: ['library'] }); await client.invalidateQueries({ queryKey: ['stats'] }); }
    catch (error) { setChangeError(error instanceof Error ? error.message : 'The entry could not be updated.'); }
  }
  async function removeEntry(entry: LibraryEntry) {
    setRemoveTarget(entry); setRemoveError('');
  }
  async function confirmRemoveEntry() {
    if (!removeTarget) return;
    setRemoveBusy(true); setRemoveError('');
    try {
      await apiRequest(`/library/${removeTarget._id}`, { method: 'DELETE' });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['library'] }),
        client.invalidateQueries({ queryKey: ['lists'] }),
        client.invalidateQueries({ queryKey: ['stats'] }),
        client.invalidateQueries({ queryKey: ['title', removeTarget.titleId._id] }),
      ]);
      setRemoveTarget(null);
    } catch (error) { setRemoveError(error instanceof Error ? error.message : 'The title could not be removed from your library.'); }
    finally { setRemoveBusy(false); }
  }
  function chooseStatus(value: string) { setStatus(value); const next = new URLSearchParams(params); if (value) next.set('status', value); else next.delete('status'); setParams(next); }

  return <div className="page-wrap library-page">
    <PageHeading eyebrow="Everything you keep" title="The library." description="A title has one place in your library. Change its status as your plans change." action={<Link className="button button--outline" to="/app/discover"><Plus size={15} /> Add a title</Link>} />
    <section className="library-controls" aria-label="Filter library">
      <label className="library-search"><Search size={17} /><span className="visually-hidden">Search your library</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your titles" /></label>
      <label><span className="visually-hidden">Filter by status</span><select value={status} onChange={(event) => chooseStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label><span className="visually-hidden">Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item.replaceAll('-', ' ')}</option>)}</select></label>
    </section>
    <div className="results-heading"><p>{result.data ? `${result.data.total} ${result.data.total === 1 ? 'title' : 'titles'} in this view` : 'Your personal collection'}</p><Link to="/app/collections" className="inline-arrow">Open collections <ArrowRight size={14} /></Link></div>
    {changeError && <p className="form-alert" role="alert">{changeError}</p>}
    {result.isLoading ? <LoadingLine label="Opening your library" /> : result.error ? <EmptyState title="Your library could not load" description={result.error instanceof Error ? result.error.message : 'Check the connection and try again.'} action={<Button variant="outline" onClick={() => void result.refetch()}>Try again</Button>} /> : result.data?.items.length ? <><div className="library-entries">{result.data.items.map((entry) => <LibraryEntryCard key={entry._id} entry={entry} onChange={changeEntry} onRemove={removeEntry} />)}</div><PageControls page={page} totalPages={Math.ceil(result.data.total / result.data.limit)} onChange={setPage} /></> : <EmptyState title={status ? 'Nothing in this section yet' : 'Your library is waiting for a first title'} description="Search the catalog or add a title by hand. The collection will grow from your own viewing history." action={<Link className="button button--primary" to="/app/discover"><Search size={16} /> Find a title</Link>} icon={<Film size={22} />} />}
    <ConfirmDialog open={Boolean(removeTarget)} eyebrow="Your library" title="Remove this title?" description={removeTarget ? `Remove “${removeTarget.titleId.title}” from your library? Its collection links will also be removed.` : ''} confirmLabel="Remove title" busy={removeBusy} error={removeError} onCancel={() => setRemoveTarget(null)} onConfirm={() => void confirmRemoveEntry()} />
  </div>;
}

type DetailResult = { item: MediaTitle; myCommunityRating: number | null; libraryEntry: Omit<LibraryEntry, '_id' | 'titleId' | 'userId' | 'createdAt' | 'updatedAt'> & { _id?: string } | null };
type TitleReview = { _id: string; body: string; createdAt: string; updatedAt: string; userId: { _id: string; username: string; avatar: string } };

export function TitlePage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['title', id], queryFn: () => apiRequest<DetailResult>(`/catalog/${id}`) });
  const reviews = useQuery({ queryKey: ['title-reviews', id], queryFn: () => apiRequest<{ items: TitleReview[] }>(`/titles/${id}/reviews`) });
  const [rating, setRating] = useState('');
  const [ratingSaving, setRatingSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingReviewBody, setEditingReviewBody] = useState('');
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const [collectionPicker, setCollectionPicker] = useState(false);
  const collections = useQuery({ queryKey: ['lists'], queryFn: () => apiRequest<{ items: UserList[] }>('/lists'), enabled: collectionPicker });
  useEffect(() => { setRating(ratingChoice(detail.data?.myCommunityRating)); }, [detail.data?.myCommunityRating]);

  if (detail.isLoading) return <div className="page-wrap"><LoadingLine label="Opening title details" /></div>;
  if (detail.error || !detail.data) return <div className="page-wrap"><EmptyState title="Title not found" description={detail.error instanceof Error ? detail.error.message : 'This title may have been removed.'} action={<Link className="button button--outline" to="/app/discover"><ArrowLeft size={15} /> Back to discover</Link>} /></div>;

  const { item, libraryEntry } = detail.data;
  const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;
  async function updateLibrary(body: Record<string, unknown>) {
    try {
      setError('');
      if (libraryEntry?._id) await apiRequest(`/library/${libraryEntry._id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await apiRequest('/library', { method: 'POST', body: JSON.stringify({ titleId: item._id, status: 'planned', ...body }) });
      await queryClient.invalidateQueries({ queryKey: ['title', id] });
      await queryClient.invalidateQueries({ queryKey: ['library'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
      setNotice(libraryEntry ? 'Your library entry was updated.' : 'Added to your library.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The library could not be updated.'); }
  }
  async function saveRating(nextRating: string, force = false) {
    if (!nextRating || ratingSaving || (!force && nextRating === rating)) return;
    const previousRating = ratingChoice(detail.data?.myCommunityRating);
    setRating(nextRating);
    setRatingSaving(true);
    try {
      setError('');
      await apiRequest(`/titles/${item._id}/rating`, { method: 'PUT', body: JSON.stringify({ rating: Number(nextRating) }) });
      await queryClient.invalidateQueries({ queryKey: ['title', id] });
      setNotice('Your rating was saved and included in the community rating.');
    } catch (cause) {
      setRating(previousRating);
      setError(cause instanceof Error ? cause.message : 'The rating could not be saved.');
    } finally { setRatingSaving(false); }
  }
  async function removeRating() {
    try {
      await apiRequest(`/titles/${item._id}/rating`, { method: 'DELETE' });
      setRating('');
      await queryClient.invalidateQueries({ queryKey: ['title', id] });
      setNotice('Your rating was removed.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The rating could not be removed.'); }
  }
  async function submitReview(event: FormEvent) {
    event.preventDefault();
    try {
      setError('');
      await apiRequest(`/titles/${item._id}/reviews`, { method: 'POST', body: JSON.stringify({ body: reviewBody }) });
      setReviewBody('');
      await queryClient.invalidateQueries({ queryKey: ['title-reviews', id] });
      setNotice('Your review was published.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your review could not be published.'); }
  }
  async function saveReviewEdit(reviewId: string) {
    try {
      setError('');
      await apiRequest(`/titles/${item._id}/reviews/${reviewId}`, { method: 'PUT', body: JSON.stringify({ body: editingReviewBody }) });
      setEditingReviewId(null);
      await queryClient.invalidateQueries({ queryKey: ['title-reviews', id] });
      setNotice('Your review was updated.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your review could not be updated.'); }
  }
  function deleteReview(reviewId: string) {
    setDeletingReviewId(reviewId);
  }
  async function confirmDeleteReview() {
    if (!deletingReviewId) return;
    try {
      setError('');
      await apiRequest(`/titles/${item._id}/reviews/${deletingReviewId}`, { method: 'DELETE' });
      setDeletingReviewId(null);
      await queryClient.invalidateQueries({ queryKey: ['title-reviews', id] });
      setNotice('Your review was deleted.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your review could not be deleted.'); }
  }
  async function addToCollection(listId: string) {
    try {
      await apiRequest(`/lists/${listId}/items`, { method: 'POST', body: JSON.stringify({ titleId: item._id }) });
      await queryClient.invalidateQueries({ queryKey: ['lists'] });
      setCollectionPicker(false);
      setNotice('Added to your collection.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The title could not be added to that collection.'); }
  }

  return <div className="title-page">
    <div className="title-backdrop" style={item.backdrop ? { backgroundImage: `url("${item.backdrop}")` } : undefined} />
    <div className="title-page__content">
      <Link className="inline-arrow title-back" to="/app/discover"><ArrowLeft size={15} /> Back to discovery</Link>
      {error && <p className="form-alert" role="alert">{error}</p>}{notice && <p className="success-banner" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={15} /></button></p>}
      <section className="title-hero">
        <Poster title={item} size="large" />
        <div className="title-hero__copy"><p className="eyebrow">{item.metadataSource === 'manual' ? 'Added by you' : item.mediaType === 'movie' ? 'Film' : 'Series'}{year ? ` · ${year}` : ''}</p><h1>{item.title}</h1>{item.originalTitle && item.originalTitle !== item.title && <p className="original-title">{item.originalTitle}</p>}
          <div className="title-tags">{item.categories?.map((tag) => <span key={tag}>{tag.replaceAll('-', ' ')}</span>)}{item.genres?.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>
          <p className="title-synopsis">{item.synopsis || 'No description has been added for this title yet.'}</p>
          <div className="title-facts">{item.mediaType === 'series' && item.totalEpisodes ? <span>{item.totalEpisodes} episodes</span> : null}{item.seasons ? <span>{item.seasons} seasons</span> : null}{item.runtime ? <span>{item.runtime} min</span> : null}{item.countries?.map((country) => <span key={country}>{country}</span>)}</div>
          <div className="title-actions">{libraryEntry ? <label className="status-select-label"><span>Status in your library</span><select value={libraryEntry.status} onChange={(event) => void updateLibrary({ status: event.target.value })}>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label> : <Button onClick={() => void updateLibrary({ status: 'watching' })}><Plus size={16} /> Add to library</Button>}
            <div className="collection-picker-wrap"><Button variant="outline" aria-expanded={collectionPicker} onClick={() => setCollectionPicker((value) => !value)}><Heart size={15} /> Add to a collection</Button>{collectionPicker && <div className="collection-picker" role="group" aria-label="Choose a collection">{collections.isLoading ? <span>Loading collections…</span> : collections.data?.items.length ? collections.data.items.map((list) => <button key={list._id} onClick={() => void addToCollection(list._id)}>{list.name}<ArrowRight size={13} /></button>) : <Link to="/app/collections">Create a collection first <ArrowRight size={13} /></Link>}</div>}</div>
          </div>
          {libraryEntry && item.mediaType === 'series' && <form className="detail-progress" onSubmit={(event) => { event.preventDefault(); const target = event.currentTarget.elements.namedItem('episodes') as HTMLInputElement; void updateLibrary({ episodesWatched: Number(target.value) }); }}><label htmlFor="detail-episodes">Progress</label><input id="detail-episodes" name="episodes" type="number" min={0} max={item.totalEpisodes || 10000} defaultValue={libraryEntry.status === 'completed' && item.totalEpisodes ? item.totalEpisodes : libraryEntry.episodesWatched} disabled={libraryEntry.status === 'completed'} /><span>{item.totalEpisodes ? `of ${item.totalEpisodes} episodes` : 'episodes watched'}{libraryEntry.status === 'completed' ? ' · Complete' : ''}</span>{libraryEntry.status !== 'completed' && <Button type="submit" variant="outline">Save progress</Button>}</form>}
        </div>
      </section>
      <section className="ratings-section" aria-labelledby="ratings-heading"><div className="section-topline"><div><p className="eyebrow">Provider and community scores</p><h2 id="ratings-heading">Ratings</h2></div></div>
        <div className="rating-panels">
          <article className="rating-panel"><p className="eyebrow">TMDB</p>{item.tmdbRating != null ? <strong>{item.tmdbRating.toFixed(1)}<small> / 10</small></strong> : <p>No TMDB score available.</p>}<span>{item.tmdbVoteCount ? `${item.tmdbVoteCount.toLocaleString()} votes` : 'The Movie Database'}</span></article>
          <article className="rating-panel"><p className="eyebrow">AniList</p>{item.anilistAverageScore != null ? <strong>{item.anilistAverageScore}<small> / 100</small></strong> : <p>No AniList score available.</p>}<span>{[item.anilistMeanScore != null ? `Mean ${item.anilistMeanScore}/100` : '', item.anilistPopularity != null ? `${item.anilistPopularity.toLocaleString()} tracking` : ''].filter(Boolean).join(' · ') || 'Anime community score'}</span></article>
          <article className="rating-panel"><p className="eyebrow">Showgraphy community</p>{item.communityRatingCount ? <strong>{item.communityRating?.toFixed(2)}<small> / 10</small></strong> : <p>No community ratings yet.</p>}<span>{item.communityRatingCount ? `${item.communityRatingCount.toLocaleString()} ${item.communityRatingCount === 1 ? 'rating' : 'ratings'}` : 'Your rating can start the conversation.'}</span></article>
          <article className="rating-panel rating-panel--yours"><p className="eyebrow">Your rating</p><div className="rating-picker"><Star size={17} aria-hidden="true" /><label className="visually-hidden" htmlFor="your-rating">Choose your rating from 1 to 10 in half-point steps</label><select id="your-rating" className="rating-select" value={rating} disabled={ratingSaving} onChange={(event) => { setRating(event.target.value); void saveRating(event.target.value, true); }} aria-describedby="rating-save-status"><option value="">Select</option>{ratingOptions.map((value) => <option value={value} key={value}>{value}</option>)}</select></div><span className="rating-save-status" id="rating-save-status" role="status">{ratingSaving ? 'Saving rating…' : rating ? `Your rating: ${Number(rating).toFixed(1)} / 10` : 'Choose a score from 1 to 10 in half-point steps'}</span>{detail.data.myCommunityRating != null && <button type="button" className="text-button" disabled={ratingSaving} onClick={() => void removeRating()}>Remove your rating</button>}</article>
        </div>
      </section>
      <section className="title-reviews" aria-labelledby="reviews-heading">
        <div className="section-topline"><div><p className="eyebrow">Notes from the community</p><h2 id="reviews-heading"><MessageSquareText size={22} /> Reviews</h2><p>Rate this title once. Write as many separate reviews as you like.</p></div></div>
        <form className="review-form" onSubmit={submitReview}><label htmlFor="title-review">Write a review</label><textarea id="title-review" value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} minLength={1} maxLength={3000} rows={5} placeholder="What stayed with you?" required /><span>{reviewBody.length}/3000</span><Button type="submit" disabled={!reviewBody.trim()}>Publish review</Button></form>
        <div className="review-list">{reviews.isLoading ? <LoadingLine label="Loading reviews" /> : reviews.data?.items.length ? reviews.data.items.map((review) => <article className="review-card" key={review._id}><header><strong>@{review.userId.username}</strong><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString()}</time></header>{editingReviewId === review._id ? <div className="review-edit"><textarea aria-label="Edit review" value={editingReviewBody} onChange={(event) => setEditingReviewBody(event.target.value)} maxLength={3000} rows={4} /><span>{editingReviewBody.length}/3000</span><Button disabled={!editingReviewBody.trim()} onClick={() => void saveReviewEdit(review._id)}>Save changes</Button><Button variant="outline" onClick={() => setEditingReviewId(null)}>Cancel</Button></div> : <><p>{review.body}</p>{user?.id === review.userId._id && <div className="review-actions"><button className="text-button" onClick={() => { setEditingReviewId(review._id); setEditingReviewBody(review.body); }}><Pencil size={14} /> Edit</button><button className="text-button" onClick={() => void deleteReview(review._id)}><Trash2 size={14} /> Delete</button></div>}</>}</article>) : <p className="review-empty">No reviews yet. Start the conversation.</p>}</div>
      </section>
      <Suspense fallback={null}><TitleDiscussions titleId={item._id} title={item} /></Suspense>
      {deletingReviewId && <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeletingReviewId(null); }}><section className="dialog-panel confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-review-title"><div className="dialog-header"><div><p className="eyebrow">Remove your review</p><h2 id="delete-review-title">Delete this review?</h2></div><button className="icon-button" aria-label="Close confirmation" onClick={() => setDeletingReviewId(null)}><X size={18} /></button></div><p>This review will be permanently deleted.</p><div className="dialog-actions"><Button variant="outline" onClick={() => setDeletingReviewId(null)}>Cancel</Button><Button variant="danger" onClick={() => void confirmDeleteReview()}>Delete review</Button></div></section></div>}
    </div>
  </div>;
}
