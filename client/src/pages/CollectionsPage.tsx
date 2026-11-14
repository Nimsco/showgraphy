import { useDeferredValue, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Copy, FolderHeart, Link2, Plus, Search, Share2, Trash2, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, LoadingLine, Logo, PageHeading, Poster } from '../components/ui';
import { apiRequest } from '../lib/api';
import type { MediaTitle, UserList } from '../types';

type ListsResult = { items: UserList[] };
type ShareResult = { item: { name: string; description: string; items: MediaTitle[]; updatedAt: string }; owner: { username: string; avatar: string } };
type SearchResult = { items: MediaTitle[]; providers: { tmdb: boolean; anilist: boolean } };

export function CollectionsPage() {
  const client = useQueryClient();
  const lists = useQuery({ queryKey: ['lists'], queryFn: () => apiRequest<ListsResult>('/lists') });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function createList(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await apiRequest('/lists', { method: 'POST', body: JSON.stringify({ name, description }) });
      setName(''); setDescription(''); setCreating(false); await client.invalidateQueries({ queryKey: ['lists'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The collection could not be created.'); }
    finally { setBusy(false); }
  }
  const items = lists.data?.items ?? [];

  return <div className="page-wrap collections-page">
    <PageHeading eyebrow="Keep titles together" title="Collections." description="A watchlist for what comes next, and personal collections for every other thread you want to keep." action={<Button onClick={() => setCreating((value) => !value)}><Plus size={16} /> New collection</Button>} />
    {creating && <form className="create-collection" onSubmit={createList}><div><p className="eyebrow">A collection of your own</p><h2>Give it a name.</h2></div><label>Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required placeholder="Weekend films" /></label><label>Description <span className="field-optional">Optional</span><input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={280} placeholder="A note for you or anyone you share it with" /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="form-actions"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Create collection'}</Button></div></form>}
    {lists.isLoading ? <LoadingLine label="Opening your collections" /> : lists.error ? <EmptyState title="Your collections could not open" description={lists.error instanceof Error ? lists.error.message : 'Check the connection and try again.'} action={<Button variant="outline" onClick={() => void lists.refetch()}>Try again</Button>} /> : items.length ? <div className="collection-grid">{items.map((list) => {
      const titles = list.orderedItems?.map((entry) => entry.titleId).filter(Boolean) ?? [];
      return <Link className={`collection-card${list.listType === 'watchlist' ? ' collection-card--watchlist' : ''}`} to={`/app/collections/${list._id}`} key={list._id}>
        <div className="collection-card__art" aria-hidden="true">{titles.slice(0, 3).map((title, index) => <span key={`${title._id}-${index}`} style={{ backgroundImage: title.poster ? `url("${title.poster}")` : undefined }} />)}{titles.length === 0 && <FolderHeart size={23} />}</div>
        <div className="collection-card__copy"><div className="collection-card__title"><h2>{list.name}</h2>{list.visibility === 'public' && <Share2 size={14} aria-label="Public collection" />}</div><p>{list.description || (list.listType === 'watchlist' ? 'Your titles to watch next.' : 'A collection you are building.')}</p><span>{titles.length} {titles.length === 1 ? 'title' : 'titles'} <ArrowRight size={13} /></span></div>
      </Link>;
    })}</div> : <EmptyState title="Your first collection is yours to name" description="Start with your watchlist or create a collection for a mood, a genre, or a recommendation you want to remember." action={<Button onClick={() => setCreating(true)}><Plus size={16} /> Create a collection</Button>} icon={<FolderHeart size={22} />} />}
    <p className="collections-privacy"><Link2 size={15} /> Collections are private unless you make one public or create a share link.</p>
  </div>;
}

export function CollectionDetailPage() {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const lists = useQuery({ queryKey: ['lists'], queryFn: () => apiRequest<ListsResult>('/lists') });
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search.trim());
  const [shareUrl, setShareUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const list = lists.data?.items.find((item) => item._id === id);
  const searchResults = useQuery({ queryKey: ['catalog-search', deferred, 'collection'], queryFn: () => apiRequest<SearchResult>(`/catalog/search?q=${encodeURIComponent(deferred)}`), enabled: deferred.length >= 2, retry: false });

  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['lists'] }), client.invalidateQueries({ queryKey: ['library'] }), client.invalidateQueries({ queryKey: ['stats'] })]); }
  async function addTitle(titleId: string) {
    try { setError(''); await apiRequest(`/lists/${id}/items`, { method: 'POST', body: JSON.stringify({ titleId }) }); setStatus('Title added to this collection.'); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The title could not be added.'); }
  }
  async function removeTitle(titleId: string) {
    const title = list?.orderedItems?.find((entry) => entry.titleId?._id === titleId)?.titleId;
    if (!list || !title || !window.confirm(`Do you want to remove ${title.title} from ${list.name}?`)) return;
    try { await apiRequest(`/lists/${id}/items/${titleId}`, { method: 'DELETE' }); setError(''); setStatus(list?.listType === 'watchlist' ? 'Title removed from your watchlist.' : 'Title removed from this collection.'); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The title could not be removed.'); }
  }
  async function createShare() {
    try { setError(''); const result = await apiRequest<{ url: string }>(`/lists/${id}/share`, { method: 'POST', body: JSON.stringify({ expiresInDays: 30 }) }); setShareUrl(result.url); setStatus('A 30-day share link is ready.'); await navigator.clipboard.writeText(result.url).catch(() => undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The share link could not be created.'); }
  }
  async function revokeShare() {
    try { await apiRequest(`/lists/${id}/share`, { method: 'DELETE' }); setShareUrl(''); setStatus('The current share link was revoked.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The link could not be revoked.'); }
  }
  async function changeVisibility(visibility: 'public' | 'private') {
    try { await apiRequest(`/lists/${id}`, { method: 'PATCH', body: JSON.stringify({ visibility }) }); setStatus(`This collection is now ${visibility}.`); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Visibility could not be changed.'); }
  }
  async function deleteCollection() {
    if (!list || list.listType === 'watchlist') return;
    if (!window.confirm(`Delete “${list.name}”? This removes the collection and its share links.`)) return;
    try { await apiRequest(`/lists/${id}`, { method: 'DELETE' }); window.location.assign('/app/collections'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The collection could not be deleted.'); }
  }

  if (lists.isLoading) return <div className="page-wrap"><LoadingLine label="Opening collection" /></div>;
  if (!list) return <div className="page-wrap"><EmptyState title="Collection not found" description="It may have been removed, or it may belong to another account." action={<Link className="button button--outline" to="/app/collections"><ArrowLeft size={15} /> Back to collections</Link>} /></div>;
  const titles = list.orderedItems?.map((entry) => entry.titleId).filter(Boolean) ?? [];

  return <div className="page-wrap collection-detail-page">
    <Link className="inline-arrow back-link" to="/app/collections"><ArrowLeft size={15} /> All collections</Link>
    <div className="collection-detail-heading"><div><p className="eyebrow">{list.listType === 'watchlist' ? 'Your next stories' : 'A collection by you'}</p><h1>{list.name}</h1><p>{list.description || (list.listType === 'watchlist' ? 'Titles you plan to watch.' : 'A personal collection of titles.')}</p><span className="collection-count">{titles.length} {titles.length === 1 ? 'title' : 'titles'} · {list.visibility}</span></div>
      <div className="collection-actions"><label><span className="visually-hidden">Collection visibility</span><select value={list.visibility} onChange={(event) => void changeVisibility(event.target.value as 'public' | 'private')}><option value="private">Private</option><option value="public">Public profile</option></select></label>{list.listType !== 'watchlist' && <Button variant="quiet" onClick={() => void deleteCollection()} aria-label="Delete collection"><Trash2 size={16} /></Button>}</div>
    </div>
    {(error || status) && <p className={error ? 'form-alert' : 'success-banner'} role={error ? 'alert' : 'status'}>{error || status}<button aria-label="Dismiss message" onClick={() => { setError(''); setStatus(''); }}><X size={15} /></button></p>}
    <section className="collection-add"><div><p className="eyebrow">Add a title</p><h2>Keep the list growing.</h2></div><label className="library-search"><Search size={16} /><span className="visually-hidden">Search titles to add</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the catalog" /></label>
      {searchResults.data?.items?.length ? <div className="add-results">{searchResults.data.items.slice(0, 5).map((title) => <div className="add-result" key={title._id}><Poster title={title} size="small" /><span>{title.title}</span><Button variant="outline" onClick={() => void addTitle(title._id)}><Plus size={14} /> Add</Button></div>)}</div> : deferred.length >= 2 && !searchResults.isLoading && <p className="quiet-line">No matches. <Link to="/app/discover">Add a title by hand in Discover.</Link></p>}
    </section>
    {titles.length ? <div className="collection-titles">{titles.map((title, index) => <article className="collection-title-row" key={`${title._id}-${index}`}><span className="collection-title-row__position">{String(index + 1).padStart(2, '0')}</span><Link to={`/app/title/${title._id}`} className="collection-title-row__poster"><Poster title={title} size="small" /></Link><div><h2><Link to={`/app/title/${title._id}`}>{title.title}</Link></h2><p>{title.releaseDate?.slice(0, 4)} · {title.mediaType === 'movie' ? 'Film' : 'Series'}</p></div>{list.listType === 'watchlist' ? <button className="watchlist-remove" aria-label={`Remove ${title.title} from your watchlist`} onClick={() => void removeTitle(title._id)}><X size={15} /><span>Remove</span></button> : <button className="icon-button" aria-label={`Remove ${title.title} from this collection`} onClick={() => void removeTitle(title._id)}><X size={17} /></button>}</article>)}</div> : <EmptyState title="This collection is still open" description="Search for a title above and add it when you find one that belongs here." action={<Link className="inline-arrow" to="/app/discover">Browse the catalog <ArrowRight size={15} /></Link>} />}
    <section className="share-panel"><div><p className="eyebrow">Share this collection</p><h2>Let someone see your picks.</h2><p>Anyone with the link can view titles. They cannot see your notes or account details. The link expires after 30 days and can be revoked.</p></div><div className="share-controls">{shareUrl ? <><label className="visually-hidden" htmlFor="share-url">Share link</label><input id="share-url" value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setStatus('Share link copied.')).catch(() => setStatus('Select the link and copy it.'))}><Copy size={15} /> Copy</Button><Button variant="quiet" onClick={() => void revokeShare()}>Revoke</Button></> : <Button onClick={() => void createShare()}><Share2 size={16} /> Create share link</Button>}</div></section>
  </div>;
}

export function SharedCollectionPage() {
  const { token = '' } = useParams();
  const share = useQuery({ queryKey: ['share', token], queryFn: () => apiRequest<ShareResult>(`/shares/${token}`), retry: false });
  if (share.isLoading) return <div className="page-wrap"><LoadingLine label="Opening shared collection" /></div>;
  if (share.error || !share.data) return <main className="share-public"><Link to="/" aria-label="Showgraphy home"><Logo /></Link><EmptyState title="This collection is unavailable" description={share.error instanceof Error ? share.error.message : 'The owner may have revoked the link or it may have expired.'} action={<Link className="button button--outline" to="/">Go to Showgraphy</Link>} /></main>;
  const { item, owner } = share.data;
  return <main className="share-public"><header><Link to="/" aria-label="Showgraphy home"><Logo /></Link><Link className="button button--outline" to="/register">Make your own journal <ArrowRight size={15} /></Link></header><section className="share-public__intro"><p className="eyebrow">A collection by <Link to={`/u/${owner.username}`}>@{owner.username}</Link></p><h1>{item.name}</h1><p>{item.description || 'A set of titles worth keeping together.'}</p><span>{item.items.length} {item.items.length === 1 ? 'title' : 'titles'}</span></section>{item.items.length ? <div className="media-grid media-grid--search">{item.items.map((title) => <article className="media-card" key={title._id}><Poster title={title} /><div className="media-card__body"><h2>{title.title}</h2><p className="media-card__meta">{title.releaseDate?.slice(0, 4)} · {title.mediaType === 'movie' ? 'Film' : 'Series'}</p></div></article>)}</div> : <EmptyState title="No titles in this collection yet" description="The owner has not added a title to this list." />}</main>;
}
