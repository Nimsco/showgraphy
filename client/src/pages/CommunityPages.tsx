import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Flag, Heart, ImagePlus, MessageCircle, MoreHorizontal, Plus, Search, Send, Shield, Sparkles, Trash2, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, ConfirmDialog, EmptyState, LoadingLine, PageHeading, Poster } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';
import type { MediaTitle } from '../types';

type Person = { _id?: string; id?: string; username: string; avatar?: string; bio?: string; isFollowing?: boolean };
type TitleReference = { titleId: string; title: string; poster?: string; mediaType: 'movie' | 'series'; releaseDate?: string };
type CommunityImage = { publicId: string; secureUrl: string; version: number; width: number; height: number; format: string; bytes: number };
type Poll = { question: string; options: string[]; counts?: number[]; totalVotes?: number; myVote?: number | null; expiresAt?: string; closed?: boolean };
type CommunityCategory = 'general' | 'anime' | 'k-drama' | 'c-drama' | 'j-drama' | 'movies' | 'tv-series' | 'western-series' | 'animation' | 'documentaries' | 'other';
type Post = { _id: string; title?: string; author: Person; content: string; categories?: CommunityCategory[]; category?: string; mediaReferences: TitleReference[]; images?: CommunityImage[]; mentions?: Person[]; containsSpoilers: boolean; spoilerDescription?: string; poll?: Poll; likeCount: number; commentCount: number; bookmarkCount: number; createdAt: string; isEdited?: boolean; isLiked: boolean; isBookmarked: boolean };
type Comment = { _id: string; post: string; author: Person; content: string; mentions?: Person[]; createdAt: string; editedAt?: string; deletedAt?: string; parentComment?: string | null; replyCount?: number; replies?: Comment[] };
type Page<T> = { items: T[]; page: number; hasMore: boolean };
type UploadSignature = { allowed_formats: string; folder: string; public_id: string; timestamp: number; overwrite: string; signature: string; cloudName: string; apiKey: string };
const communityCategories: Array<{ value: CommunityCategory; label: string }> = [
  { value: 'general', label: 'General' }, { value: 'anime', label: 'Anime' }, { value: 'k-drama', label: 'K-Drama' }, { value: 'c-drama', label: 'C-Drama' }, { value: 'j-drama', label: 'J-Drama' }, { value: 'movies', label: 'Movies' }, { value: 'tv-series', label: 'TV Series' }, { value: 'western-series', label: 'Western Series' }, { value: 'animation', label: 'Animation' }, { value: 'documentaries', label: 'Documentaries' }, { value: 'other', label: 'Other' },
];
const categoryLabel = (value: string) => communityCategories.find((item) => item.value === value)?.label ?? value;
function categoriesFor(post: Post): CommunityCategory[] { return post.categories?.length ? post.categories : ['general']; }
const mainFilterCategories = communityCategories.slice(0, 7);
const extraFilterCategories = communityCategories.slice(7);
function CategorySelector({ value, onChange }: { value: CommunityCategory[]; onChange: (next: CommunityCategory[]) => void }) {
  const [open, setOpen] = useState(false);
  function toggle(category: CommunityCategory) { onChange([category]); setOpen(false); }
  return <div className="community-category-select"><button type="button" className="community-category-select__trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{value.map(categoryLabel).join(' · ')} <ChevronDown size={14} /></button>{open && <div className="community-category-select__menu" role="group" aria-label="Choose one post category">{communityCategories.map((item) => <button type="button" key={item.value} aria-pressed={value.includes(item.value)} className={value.includes(item.value) ? 'is-selected' : ''} onClick={() => toggle(item.value)}>{item.label}{value.includes(item.value) && <Check size={13} />}</button>)}<small>Choose one category.</small></div>}</div>;
}
function CommunityCategoryFilters({ selected, onSelect }: { selected: CommunityCategory | ''; onSelect: (value: CommunityCategory | '') => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = extraFilterCategories.some((item) => item.value === selected);
  return <nav className="community-category-filters" aria-label="Filter by category"><div className="community-category-filters__scroll"><button type="button" className={!selected ? 'is-active' : ''} onClick={() => onSelect('')}>All</button>{mainFilterCategories.map((item) => <button type="button" key={item.value} className={selected === item.value ? 'is-active' : ''} onClick={() => onSelect(item.value)}>{item.label}</button>)}</div><div className="community-category-filters__more"><button type="button" className={moreActive ? 'is-active' : ''} aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>More <ChevronDown size={13} /></button>{moreOpen && <div>{extraFilterCategories.map((item) => <button type="button" key={item.value} className={selected === item.value ? 'is-active' : ''} onClick={() => { onSelect(item.value); setMoreOpen(false); }}>{item.label}</button>)}</div>}</div></nav>;
}
function useCommunityScrollRestore(ready: boolean) {
  const location = useLocation();
  useEffect(() => {
    if (!ready) return;
    const saved = sessionStorage.getItem(`community-scroll:${location.key}`);
    if (saved === null) return;
    const y = Number(saved);
    if (!Number.isFinite(y)) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    sessionStorage.removeItem(`community-scroll:${location.key}`);
    return () => cancelAnimationFrame(frame);
  }, [location.key, ready]);
}
function postTitle(post: Post) { return post.title?.trim() || post.content.trim().split('\n')[0]?.slice(0, 180) || post.mediaReferences[0]?.title || 'Community discussion'; }
function timeSince(value: string) { const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function localDateTime(value?: string) { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19); }
function Avatar({ person }: { person: Person }) { return <span className="community-avatar">{person.avatar ? <img src={person.avatar} alt="" /> : person.username.slice(0, 1).toUpperCase()}</span>; }
function TitleReferenceCard({ title }: { title: TitleReference }) { return <Link className="community-title-ref" to={`/app/title/${title.titleId}`}><span className="community-title-ref__poster">{title.poster ? <img src={title.poster} alt="" /> : title.title.slice(0, 1)}</span><span><strong>{title.title}</strong><small>{title.mediaType === 'movie' ? 'Film' : 'Series'}{title.releaseDate ? ` · ${new Date(title.releaseDate).getFullYear()}` : ''}</small></span><ArrowUpRight size={16} /></Link>; }

function MentionText({ content, mentions = [] }: { content: string; mentions?: Person[] }) {
  const usernames = new Set(mentions.map((person) => person.username.toLowerCase()));
  const pattern = /@[a-z0-9_]{3,24}/gi;
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) pieces.push(content.slice(cursor, index));
    const username = match[0].slice(1);
    pieces.push(usernames.has(username.toLowerCase()) ? <Link key={`${index}-${username}`} to={`/u/${username}`}>{match[0]}</Link> : match[0]);
    cursor = index + match[0].length;
  }
  if (cursor < content.length) pieces.push(content.slice(cursor));
  return <>{pieces}</>;
}

function ReportDialog({ resourcePath, label, onClose }: { resourcePath: string; label: string; onClose: () => void }) {
  const [reason, setReason] = useState<'spam' | 'harassment' | 'inappropriate-content' | 'unmarked-spoiler' | 'other'>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await apiRequest(resourcePath, { method: 'POST', body: JSON.stringify({ reason, details }) }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The report could not be sent.'); }
    finally { setBusy(false); }
  }
  return <div className="dialog-scrim community-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="community-report-title"><div className="dialog-header"><div><p className="eyebrow">Keep the room welcoming</p><h2 id="community-report-title">Report {label}</h2></div><button type="button" className="icon-button" aria-label="Close report dialog" disabled={busy} onClick={onClose}><X size={18} /></button></div><form onSubmit={(event) => void submit(event)}><label>Reason<select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="inappropriate-content">Inappropriate content</option><option value="unmarked-spoiler">Unmarked spoiler</option><option value="other">Other</option></select></label><label>Details (optional)<textarea rows={3} maxLength={500} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Add context for the moderation team" /></label>{error && <p className="form-alert" role="alert">{error}</p>}<div className="dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</Button></div></form></section></div>;
}

function PostCard({ post, onDelete, interactive = true, onOpenComments }: { post: Post; onDelete?: (post: Post) => void | Promise<void>; interactive?: boolean; onOpenComments?: () => void }) {
  const client = useQueryClient();
  const { user } = useAuth();
  const deletePost = useDeletePost();
  const [revealed, setRevealed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editReferences, setEditReferences] = useState<TitleReference[]>(post.mediaReferences);
  const [titleSearch, setTitleSearch] = useState('');
  const [titlePicker, setTitlePicker] = useState(false);
  const [editTitle, setEditTitle] = useState(postTitle(post));
  const [editText, setEditText] = useState(post.content);
  const [editCategories, setEditCategories] = useState<CommunityCategory[]>(categoriesFor(post));
  const [editContainsSpoilers, setEditContainsSpoilers] = useState(post.containsSpoilers);
  const [editSpoilerDescription, setEditSpoilerDescription] = useState(post.spoilerDescription ?? '');
  const [editImages, setEditImages] = useState<CommunityImage[]>(post.images ?? []);
  const [editPollEnabled, setEditPollEnabled] = useState(Boolean(post.poll));
  const [editPollQuestion, setEditPollQuestion] = useState(post.poll?.question ?? '');
  const [editPollOptions, setEditPollOptions] = useState(post.poll?.options ?? ['', '']);
  const [editPollExpires, setEditPollExpires] = useState(localDateTime(post.poll?.expiresAt));
  const [editSaving, setEditSaving] = useState(false);
  const [editUploading, setEditUploading] = useState(false);
  const [editUploadProgress, setEditUploadProgress] = useState(0);
  const [editImageInputError, setEditImageInputError] = useState('');
  const editImageInput = useRef<HTMLInputElement>(null);
  const pendingEditImages = useRef<CommunityImage[]>([]);
  const [imageIndex, setImageIndex] = useState<number | null>(null);
  const [reporting, setReporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [bookmarked, setBookmarked] = useState(post.isBookmarked);
  const [optimisticVote, setOptimisticVote] = useState<number | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const titleQuery = useQuery({ queryKey: ['community-edit-title-search', titleSearch], queryFn: () => apiRequest<{ items: MediaTitle[] }>(`/catalog/search?q=${encodeURIComponent(titleSearch)}`), enabled: editing && titleSearch.trim().length >= 2 });
  const own = user?.id === post.author._id || user?.id === post.author.id;
  const navigate = useNavigate();
  const location = useLocation();
  const openPost = () => { if (!interactive) return; sessionStorage.setItem(`community-scroll:${location.key}`, String(window.scrollY)); navigate(`/community/post/${post._id}`, { state: { communityReturnTo: `${location.pathname}${location.search}`, communitySourceKey: location.key } }); };
  useEffect(() => { setLiked(post.isLiked); setLikeCount(post.likeCount); setBookmarked(post.isBookmarked); }, [post.isLiked, post.likeCount, post.isBookmarked]);
  const voted = optimisticVote ?? post.poll?.myVote ?? null;
  const pollVisible = post.poll && (voted != null || post.poll.closed);
  async function like() { if (likeBusy) return; setLikeBusy(true); const previous = liked; setLiked(!previous); setLikeCount((count) => count + (previous ? -1 : 1)); setError(''); try { await apiRequest(`/community/posts/${post._id}/like`, { method: previous ? 'DELETE' : 'POST' }); await client.invalidateQueries({ queryKey: ['community'] }); } catch (cause) { setLiked(previous); setLikeCount((count) => count + (previous ? 1 : -1)); setError(cause instanceof Error ? cause.message : 'Like could not be updated.'); } finally { setLikeBusy(false); } }
  async function bookmark() { if (bookmarkBusy) return; setBookmarkBusy(true); const previous = bookmarked; setBookmarked(!previous); setError(''); try { await apiRequest(`/community/posts/${post._id}/bookmark`, { method: previous ? 'DELETE' : 'POST' }); await client.invalidateQueries({ queryKey: ['community'] }); } catch (cause) { setBookmarked(previous); setError(cause instanceof Error ? cause.message : 'Bookmark could not be updated.'); } finally { setBookmarkBusy(false); } }
  async function share() { const url = new URL(`/community/post/${post._id}`, window.location.origin).toString(); try { await navigator.clipboard.writeText(url); setError('Link copied.'); window.setTimeout(() => setError(''), 1800); } catch { setShareUrl(url); setShareCopied(false); } }
  async function vote(optionIndex: number) { setOptimisticVote(optionIndex); setError(''); try { await apiRequest(`/community/posts/${post._id}/poll-vote`, { method: 'POST', body: JSON.stringify({ optionIndex }) }); await client.invalidateQueries({ queryKey: ['community'] }); } catch (cause) { setOptimisticVote(null); setError(cause instanceof Error ? cause.message : 'Your vote could not be saved.'); } }
  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editTitle.trim() || editSaving || editUploading) return;
    setEditSaving(true); setEditImageInputError('');
    try {
      await apiRequest(`/community/posts/${post._id}`, { method: 'PATCH', body: JSON.stringify({ title: editTitle, content: editText, categories: editCategories, titleIds: editReferences.map((item) => item.titleId), images: editImages.map(({ publicId, version }) => ({ publicId, version })), poll: editPollEnabled ? { question: editPollQuestion, options: editPollOptions, ...(editPollExpires ? { expiresAt: new Date(editPollExpires).toISOString() } : {}) } : null, containsSpoilers: editContainsSpoilers, spoilerDescription: editSpoilerDescription, mentionIds: post.mentions?.filter((person) => editText.toLowerCase().includes(`@${person.username.toLowerCase()}`)).map((person) => String(person.id ?? person._id)) ?? [] }) });
      const retainedIds = new Set(editImages.map((image) => image.publicId));
      await Promise.allSettled(pendingEditImages.current.filter((image) => !retainedIds.has(image.publicId)).map((image) => apiRequest('/community/uploads/delete', { method: 'POST', body: JSON.stringify({ publicId: image.publicId }) })));
      pendingEditImages.current = [];
      setEditing(false); setTitlePicker(false); await client.invalidateQueries({ queryKey: ['community'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your edit could not be saved.'); }
    finally { setEditSaving(false); }
  }
  async function addEditImages(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (editImages.length + selected.length > 4) { setEditImageInputError('A discussion can include up to four images.'); return; }
    if (selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) { setEditImageInputError('Choose JPEG, PNG, or WebP images up to 8 MB each.'); return; }
    setEditImageInputError(''); setEditUploading(true);
    try { for (const file of selected) { const image = await uploadImage(file, setEditUploadProgress); pendingEditImages.current.push(image); setEditImages((items) => [...items, image]); } }
    catch (cause) { setEditImageInputError(cause instanceof Error ? cause.message : 'An image could not be uploaded.'); }
    finally { setEditUploading(false); setEditUploadProgress(0); if (editImageInput.current) editImageInput.current.value = ''; }
  }
  async function cancelEdit() {
    await Promise.allSettled(pendingEditImages.current.map((image) => apiRequest('/community/uploads/delete', { method: 'POST', body: JSON.stringify({ publicId: image.publicId }) })));
    pendingEditImages.current = []; setEditing(false); setEditImageInputError('');
  }

  async function removePost() { if (deleteBusy) return; setDeleteBusy(true); setDeleteError(''); try { if (onDelete) await onDelete(post); else await deletePost(post); setDeleteOpen(false); } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'The discussion could not be deleted.'); } finally { setDeleteBusy(false); } }
  function openEdit() { setMenu(false); setEditTitle(postTitle(post)); setEditText(post.content); setEditCategories(categoriesFor(post)); setEditContainsSpoilers(post.containsSpoilers); setEditSpoilerDescription(post.spoilerDescription ?? ''); setEditReferences(post.mediaReferences); setEditImages(post.images ?? []); setEditPollEnabled(Boolean(post.poll)); setEditPollQuestion(post.poll?.question ?? ''); setEditPollOptions(post.poll?.options ?? ['', '']); setEditPollExpires(localDateTime(post.poll?.expiresAt)); setEditImageInputError(''); setTitleSearch(''); setTitlePicker(false); setEditing(true); }
  function attachEditTitle(title: MediaTitle) { setEditReferences((items) => items.some((item) => item.titleId === title._id) ? items : [...items, { titleId: title._id, title: title.title, poster: title.poster, mediaType: title.mediaType, releaseDate: title.releaseDate }]); setTitleSearch(''); }
  useEffect(() => {
    if (imageIndex === null) return;
    const handle = (event: KeyboardEvent) => { if (event.key === 'Escape') setImageIndex(null); if (event.key === 'ArrowRight') setImageIndex((index) => index === null ? null : (index + 1) % (post.images?.length ?? 1)); if (event.key === 'ArrowLeft') setImageIndex((index) => index === null ? null : (index - 1 + (post.images?.length ?? 1)) % (post.images?.length ?? 1)); };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [imageIndex, post.images?.length]);
  return <article className={`community-post${interactive ? ' community-post--interactive' : ''}`} onClick={(event) => { if (!interactive || editing) return; if (event.target instanceof Element && event.target.closest('a,button,input,textarea,select')) return; openPost(); }}>
    <header className="community-post__header"><Link to={`/u/${post.author.username}`}><Avatar person={post.author} /></Link><div className="community-post__byline"><Link to={`/u/${post.author.username}`}><strong>@{post.author.username}</strong></Link><time>{timeSince(post.createdAt)}{post.isEdited ? ' · edited' : ''}</time></div><div className="community-post__categories">{categoriesFor(post).filter((category) => category !== 'general').map((category) => <span className="community-category" key={category}>{categoryLabel(category)}</span>)}</div><div className="community-post__menu-wrap"><button className="icon-button" type="button" aria-label="Post options" onClick={() => setMenu((value) => !value)}><MoreHorizontal size={18} /></button>{menu && <div className="community-post__menu">{own && <><button type="button" onClick={openEdit}>Edit discussion</button><button type="button" onClick={() => { setMenu(false); setDeleteError(''); setDeleteOpen(true); }}><Trash2 size={14} /> Delete discussion</button></>}{!own && <button type="button" onClick={() => { setMenu(false); setReporting(true); }}><Flag size={14} /> Report discussion</button>}<button type="button" onClick={() => void share()}><ArrowUpRight size={14} /> Copy link</button></div>}</div></header>
    {!editing && <h2 className="community-post__title">{postTitle(post)}</h2>}
    {editing ? <form className="community-edit-form" onSubmit={(event) => void saveEdit(event)}><input className="community-post-title-input" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={180} required aria-label="Edit post title" placeholder="Post title" /><textarea value={editText} maxLength={4000} onChange={(event) => setEditText(event.target.value)} aria-label="Edit discussion text" placeholder="Add body text (optional)" /><div className="community-edit-categories"><strong>Categories</strong><CategorySelector value={editCategories} onChange={setEditCategories} /></div><section className="community-edit-titles"><div className="community-edit-titles__heading"><strong>Linked movies or series <span>(optional)</span></strong><button type="button" onClick={() => setTitlePicker((value) => !value)}><Plus size={14} /> Link title</button></div>{editReferences.length ? editReferences.map((title) => <div className="community-edit-title" key={title.titleId}><TitleReferenceCard title={title} /><button type="button" aria-label={`Remove ${title.title}`} onClick={() => setEditReferences((items) => items.filter((item) => item.titleId !== title.titleId))}><X size={15} /></button></div>) : <small>No linked titles. Add one if it helps give your post context.</small>}{titlePicker && <div className="community-title-picker"><label className="social-search"><Search size={16} /><input value={titleSearch} onChange={(event) => setTitleSearch(event.target.value)} placeholder="Search movies, anime, and series" autoFocus /></label>{titleQuery.isFetching && <small>Searching titles…</small>}{titleQuery.data?.items.slice(0, 6).map((title) => <button type="button" key={title._id} disabled={editReferences.some((item) => item.titleId === title._id)} onClick={() => attachEditTitle(title)}><Poster title={title} size="small" /><span><strong>{title.title}</strong><small>{title.mediaType === 'movie' ? 'Film' : 'Series'} · {title.releaseDate?.slice(0, 4)}</small></span>{editReferences.some((item) => item.titleId === title._id) && <Check size={14} />}</button>)}</div>}</section><label className="community-edit-spoiler"><input type="checkbox" checked={editContainsSpoilers} onChange={(event) => setEditContainsSpoilers(event.target.checked)} /><span>Contains spoilers</span></label>{editContainsSpoilers && <label className="community-edit-spoiler-note">Spoiler note<input value={editSpoilerDescription} onChange={(event) => setEditSpoilerDescription(event.target.value)} maxLength={120} placeholder="What does this spoil?" /></label>}<section className="community-edit-images"><div className="community-edit-titles__heading"><strong>Images <span>(up to four)</span></strong><button type="button" onClick={() => editImageInput.current?.click()} disabled={editUploading || editImages.length >= 4}><Plus size={14} /> Add images</button></div><input ref={editImageInput} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void addEditImages(event.target.files)} /><div className="community-edit-images__grid">{editImages.map((image) => <div key={image.publicId}><img src={image.secureUrl} alt="Discussion image preview" /><button type="button" aria-label="Remove image" onClick={() => setEditImages((items) => items.filter((item) => item.publicId !== image.publicId))}><X size={14} /></button></div>)}</div>{editUploading && <small>Uploading image… {editUploadProgress}%</small>}{editImageInputError && <p className="form-alert" role="alert">{editImageInputError}</p>}</section><section className="community-edit-poll"><div className="community-edit-titles__heading"><strong>Poll</strong><button type="button" disabled={Boolean(post.poll?.totalVotes)} className={editPollEnabled ? 'is-active' : ''} onClick={() => setEditPollEnabled((value) => !value)}>{editPollEnabled ? 'Remove poll' : 'Add poll'}</button></div>{post.poll?.totalVotes ? <p className="community-edit-poll__lock">This poll has {post.poll.totalVotes} votes. Its question and choices are locked. You can extend its closing time.</p> : null}{editPollEnabled && <><label>Question<input value={editPollQuestion} onChange={(event) => setEditPollQuestion(event.target.value)} maxLength={180} required disabled={Boolean(post.poll?.totalVotes)} placeholder="Ask your community" /></label>{editPollOptions.map((option, index) => <div key={index}><input aria-label={`Poll option ${index + 1}`} value={option} onChange={(event) => setEditPollOptions((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} maxLength={80} required disabled={Boolean(post.poll?.totalVotes)} placeholder={`Option ${index + 1}`} /><button type="button" aria-label={`Remove poll option ${index + 1}`} disabled={Boolean(post.poll?.totalVotes) || editPollOptions.length <= 2} onClick={() => setEditPollOptions((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></div>)}{editPollOptions.length < 6 && <button type="button" disabled={Boolean(post.poll?.totalVotes)} onClick={() => setEditPollOptions((items) => [...items, ''])}><Plus size={14} /> Add option</button>}<label>Close poll (optional)<input type="datetime-local" step="1" value={editPollExpires} min={post.poll?.totalVotes && post.poll.expiresAt ? localDateTime(post.poll.expiresAt) : undefined} disabled={Boolean(post.poll?.totalVotes && !post.poll.expiresAt)} onChange={(event) => setEditPollExpires(event.target.value)} /></label></>}</section><div><Button variant="outline" type="button" disabled={editSaving || editUploading} onClick={() => void cancelEdit()}>Cancel</Button><Button type="submit" disabled={!editTitle.trim() || editSaving || editUploading || (editPollEnabled && (editPollOptions.length < 2 || editPollOptions.some((item) => !item.trim()) || !editPollQuestion.trim()))}>{editSaving ? 'Saving…' : 'Save changes'}</Button></div></form> : post.containsSpoilers && !revealed ? <button className="community-spoiler" type="button" onClick={() => setRevealed(true)}><Shield size={20} /><strong>Spoiler warning</strong><span>{post.spoilerDescription || 'Reveal this discussion'}</span><small>Tap to reveal</small></button> : <>
      {post.content && <p className="community-post__text"><MentionText content={post.content} mentions={post.mentions} /></p>}
      {post.mediaReferences.map((title) => <TitleReferenceCard key={title.titleId} title={title} />)}
      {!!post.images?.length && <div className={`community-images${post.images.length === 1 ? ' community-images--single' : ''}`}>{post.images.map((image, index) => <button type="button" key={image.publicId} onClick={() => setImageIndex(index)} aria-label={`Open image ${index + 1}`}><img src={image.secureUrl} alt={`Discussion attachment ${index + 1}`} loading="lazy" /></button>)}</div>}
      {post.poll && <div className="community-poll"><span className="eyebrow">Community poll</span><strong>{post.poll.question}</strong><div className="community-poll__options">{post.poll.options.map((option, index) => { const count = (post.poll?.counts?.[index] ?? 0) + (optimisticVote === index && post.poll?.myVote == null ? 1 : 0); const total = (post.poll?.totalVotes ?? 0) + (optimisticVote != null && post.poll?.myVote == null ? 1 : 0); const percent = total ? Math.round(count * 100 / total) : 0; return pollVisible ? <div className={`community-poll__result${voted === index ? ' is-selected' : ''}`} key={`${option}-${index}`}><span style={{ width: `${percent}%` }} /><b>{option}{voted === index && <Check size={13} />}</b><small>{percent}% · {count}</small></div> : <button type="button" className="community-poll__option" key={`${option}-${index}`} onClick={() => void vote(index)}>{option}</button>; })}</div><small className="community-poll__meta">{(post.poll.totalVotes ?? 0) + (optimisticVote != null && post.poll.myVote == null ? 1 : 0)} {(post.poll.totalVotes ?? 0) + (optimisticVote != null && post.poll.myVote == null ? 1 : 0) === 1 ? 'vote' : 'votes'} · {post.poll.closed ? 'Poll closed' : voted != null ? 'Your vote is recorded' : 'Choose one option'}</small></div>}
    </>}
    {error && <p className="community-inline-status" role="status">{error}</p>}
    <footer className="community-post__actions"><button type="button" className={liked ? 'is-active' : ''} onClick={() => void like()} disabled={likeBusy} aria-label={liked ? 'Unlike post' : 'Like post'}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /><span>{likeCount}</span></button><button type="button" onClick={() => { if (onOpenComments) onOpenComments(); else openPost(); }} aria-label="View comments"><MessageCircle size={17} /><span>{post.commentCount}</span></button><button type="button" className={bookmarked ? 'is-active' : ''} onClick={() => void bookmark()} disabled={bookmarkBusy} aria-label={bookmarked ? 'Remove bookmark' : 'Save post'}><Bookmark size={17} fill={bookmarked ? 'currentColor' : 'none'} /></button><button type="button" onClick={() => void share()} aria-label="Share post"><ArrowUpRight size={17} /></button><button type="button" className="community-post__open" onClick={openPost}>Discuss <ArrowUpRight size={14} /></button></footer>
    {reporting && <ReportDialog resourcePath={`/community/posts/${post._id}/report`} label="discussion" onClose={() => setReporting(false)} />}
    {imageIndex !== null && post.images?.[imageIndex] && <div className="community-lightbox" role="dialog" aria-modal="true" aria-label="Discussion image viewer" onMouseDown={(event) => { if (event.target === event.currentTarget) setImageIndex(null); }}><button type="button" className="community-lightbox__close" aria-label="Close image viewer" onClick={() => setImageIndex(null)}><X size={22} /></button>{post.images.length > 1 && <button type="button" className="community-lightbox__prev" aria-label="Previous image" onClick={() => setImageIndex((imageIndex - 1 + post.images!.length) % post.images!.length)}><ChevronLeft /></button>}<img src={post.images[imageIndex].secureUrl} alt={`Discussion image ${imageIndex + 1} of ${post.images.length}`} /><span>{imageIndex + 1} / {post.images.length}</span>{post.images.length > 1 && <button type="button" className="community-lightbox__next" aria-label="Next image" onClick={() => setImageIndex((imageIndex + 1) % post.images!.length)}><ChevronRight /></button>}</div>}
    <ConfirmDialog open={deleteOpen} eyebrow="Community" title="Delete this discussion?" description="This removes the discussion and its attached images for everyone." confirmLabel="Delete discussion" busy={deleteBusy} error={deleteError} onCancel={() => setDeleteOpen(false)} onConfirm={() => void removePost()} />
    {shareUrl && <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareUrl(''); }}><section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="community-share-title"><div className="dialog-header"><div><p className="eyebrow">Share a conversation</p><h2 id="community-share-title">Copy discussion link</h2></div><button type="button" className="icon-button" aria-label="Close share dialog" onClick={() => setShareUrl('')}><X size={18} /></button></div><label className="community-share-link">Discussion link<input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} /></label><p className="community-muted">If automatic copying is blocked, select the link above and copy it.</p>{shareCopied && <p className="success-inline" role="status">Link copied.</p>}<div className="dialog-actions"><Button type="button" variant="outline" onClick={() => setShareUrl('')}>Close</Button><Button type="button" onClick={() => { void navigator.clipboard.writeText(shareUrl).then(() => setShareCopied(true)).catch(() => setShareCopied(false)); }}>Copy link</Button></div></section></div>}
  </article>;
}

async function uploadImage(file: File, onProgress: (progress: number) => void): Promise<CommunityImage> {
  const signature = await apiRequest<UploadSignature>('/community/uploads/signature', { method: 'POST' });
  const form = new FormData(); form.append('file', file); form.append('api_key', signature.apiKey); form.append('timestamp', String(signature.timestamp)); form.append('signature', signature.signature); form.append('folder', signature.folder); form.append('public_id', signature.public_id); form.append('allowed_formats', signature.allowed_formats); form.append('overwrite', signature.overwrite);
  const result = await new Promise<{ public_id: string; secure_url: string; version: number; width: number; height: number; format: string; bytes: number }>((resolve, reject) => {
    const request = new XMLHttpRequest(); request.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/image/upload`); request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded * 100 / event.total)); }; request.onerror = () => reject(new Error('Image upload failed. Check your connection and try again.')); request.onload = () => { const data = JSON.parse(request.responseText || '{}') as { public_id?: string; secure_url?: string; version?: number; width?: number; height?: number; format?: string; bytes?: number; error?: { message?: string } }; if (request.status < 200 || request.status >= 300 || !data.public_id || !data.secure_url || !data.version || !data.width || !data.height || !data.format || !data.bytes) reject(new Error(data.error?.message ?? 'Image upload failed.')); else resolve(data as Required<typeof data>); }; request.send(form);
  });
  return { publicId: result.public_id, secureUrl: result.secure_url, version: result.version, width: result.width, height: result.height, format: result.format, bytes: result.bytes };
}

function PostComposer({ initialTitleId, onCreated }: { initialTitleId?: string; onCreated?: () => void }) {
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categories, setCategories] = useState<CommunityCategory[]>(['general']);
  const [spoiler, setSpoiler] = useState(false);
  const [spoilerDescription, setSpoilerDescription] = useState('');
  const [titleSearch, setTitleSearch] = useState('');
  const [titlePicker, setTitlePicker] = useState(Boolean(initialTitleId || searchParams.get('titleId')));
  const [references, setReferences] = useState<TitleReference[]>([]);
  const [images, setImages] = useState<CommunityImage[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollExpires, setPollExpires] = useState('');
  const [queryText, setQueryText] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const pendingImages = useRef<CommunityImage[]>([]);
  useEffect(() => () => { for (const image of pendingImages.current) void apiRequest('/community/uploads/delete', { method: 'POST', body: JSON.stringify({ publicId: image.publicId }) }).catch(() => undefined); }, []);
  const titleQuery = useQuery({ queryKey: ['community-title-search', titleSearch], queryFn: () => apiRequest<{ items: MediaTitle[] }>(`/catalog/search?q=${encodeURIComponent(titleSearch)}`), enabled: titleSearch.trim().length >= 2 });
  const mentionMatch = queryText.match(/(?:^|\s)@([a-zA-Z0-9_]{0,24})$/);
  const mentionQuery = useQuery({ queryKey: ['community-mention-search', mentionMatch?.[1]], queryFn: () => apiRequest<Page<Person>>(`/social/people?q=${encodeURIComponent(mentionMatch?.[1] ?? '')}&limit=5`), enabled: Boolean(mentionMatch) });
  const initialId = initialTitleId || searchParams.get('titleId') || undefined;
  const initialTitle = useQuery({ queryKey: ['community-compose-title', initialId], queryFn: () => apiRequest<{ item: MediaTitle }>(`/catalog/${initialId}`), enabled: Boolean(initialId) });
  useEffect(() => { const item = initialTitle.data?.item; if (item && !references.length) setReferences([{ titleId: item._id, title: item.title, poster: item.poster, mediaType: item.mediaType, releaseDate: item.releaseDate }]); }, [initialTitle.data?.item]);
  function attach(title: MediaTitle) { setReferences((items) => items.some((item) => item.titleId === title._id) ? items : [...items, { titleId: title._id, title: title.title, poster: title.poster, mediaType: title.mediaType, releaseDate: title.releaseDate }]); setTitleSearch(''); setTitlePicker(false); }
  function mention(person: Person) { const username = person.username; const value = content.replace(/(?:^|\s)@[a-zA-Z0-9_]{0,24}$/, (match) => `${match.startsWith(' ') ? ' ' : ''}@${username} `); setContent(value); setSelectedMentions((items) => [...items.filter((item) => item.username !== person.username), person]); setQueryText(''); textRef.current?.focus(); }
  async function addImages(files: FileList | null) {
    if (!files?.length) return; const selected = Array.from(files);
    if (images.length + selected.length > 4) { setError('A discussion can include up to four images.'); return; }
    if (selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) { setError('Choose JPEG, PNG, or WebP images up to 8 MB each.'); return; }
    setError(''); setUploading(true);
    try { for (const file of selected) { setUploadProgress(0); const image = await uploadImage(file, setUploadProgress); pendingImages.current.push(image); setImages((current) => [...current, image]); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'An image could not be uploaded.'); }
    finally { setUploading(false); setUploadProgress(0); if (imageInput.current) imageInput.current.value = ''; }
  }
  async function removeImage(image: CommunityImage) { try { await apiRequest('/community/uploads/delete', { method: 'POST', body: JSON.stringify({ publicId: image.publicId }) }); pendingImages.current = pendingImages.current.filter((item) => item.publicId !== image.publicId); setImages((items) => items.filter((item) => item.publicId !== image.publicId)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The image could not be removed.'); } }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setSaving(true);
    const poll = pollEnabled ? { question: pollQuestion.trim(), options: pollOptions.map((item) => item.trim()), ...(pollExpires ? { expiresAt: new Date(pollExpires).toISOString() } : {}) } : undefined;
    try {
      await apiRequest('/community/posts', { method: 'POST', body: JSON.stringify({ title, content, categories, titleIds: references.map((item) => item.titleId), images: images.map(({ publicId, version }) => ({ publicId, version })), mentionIds: selectedMentions.map((person) => String(person.id ?? person._id)), containsSpoilers: spoiler, spoilerDescription, poll }) });
      pendingImages.current = []; setTitle(''); setContent(''); setCategories(['general']); setReferences([]); setImages([]); setSelectedMentions([]); setSpoiler(false); setSpoilerDescription(''); setPollEnabled(false); setPollQuestion(''); setPollOptions(['', '']); setPollExpires(''); await client.invalidateQueries({ queryKey: ['community'] }); onCreated?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your post could not be published.'); }
    finally { setSaving(false); }
  }
  return <form className="community-composer" onSubmit={(event) => void submit(event)}>
    <div className="community-composer__top"><Sparkles size={16} /><span>Start a conversation</span><span className="community-character-count">{content.length}/4000</span></div>
    <input className="community-composer__title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required placeholder="Give your post a title" aria-label="Post title" />
    <textarea ref={textRef} value={content} maxLength={4000} onChange={(event) => { const next = event.target.value; setContent(next); setSelectedMentions((items) => items.filter((person) => next.toLowerCase().includes(`@${person.username.toLowerCase()}`))); setQueryText(next.slice(0, event.target.selectionStart)); }} placeholder="What stayed with you?" aria-label="Write your post" />
    {mentionMatch && mentionQuery.data?.items.length ? <div className="community-autocomplete">{mentionQuery.data.items.map((person) => <button type="button" key={person.id} onClick={() => mention(person)}><Avatar person={person} /> @{person.username}</button>)}</div> : null}
    <p className="community-title-required">A title is required. Body text and linked movie or series references are optional.</p>
    {references.length > 0 && <div className="community-composer__references">{references.map((title) => <div className="community-composer__reference" key={title.titleId}><TitleReferenceCard title={title} /><button type="button" aria-label={`Remove ${title.title}`} onClick={() => setReferences((items) => items.filter((item) => item.titleId !== title.titleId))}><X size={15} /></button></div>)}</div>}
    {titlePicker && <div className="community-title-picker"><label className="social-search"><Search size={16} /><input value={titleSearch} onChange={(event) => setTitleSearch(event.target.value)} placeholder="Search movies, anime, and series" autoFocus /></label>{titleQuery.isFetching && <small>Searching titles…</small>}{titleQuery.data?.items.slice(0, 6).map((title) => <button type="button" key={title._id} onClick={() => attach(title)}><Poster title={title} size="small" /><span><strong>{title.title}</strong><small>{title.mediaType === 'movie' ? 'Film' : 'Series'} · {title.releaseDate?.slice(0, 4)}</small></span></button>)}</div>}
    {images.length > 0 && <div className="community-composer__images">{images.map((image) => <div key={image.publicId}><img src={image.secureUrl} alt="Image preview" /><button type="button" aria-label="Remove image" onClick={() => void removeImage(image)}><X size={14} /></button></div>)}</div>}
    {uploading && <div className="community-upload-progress"><span>Uploading image… {uploadProgress}%</span><progress value={uploadProgress} max={100} /></div>}
    {spoiler && <label className="community-spoiler-label">Spoiler note<input value={spoilerDescription} onChange={(event) => setSpoilerDescription(event.target.value)} maxLength={120} placeholder="What does this spoil?" /></label>}
    {pollEnabled && <div className="community-poll-editor"><label>Poll question<input value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} maxLength={180} placeholder="Ask your community" required /></label>{pollOptions.map((option, index) => <div key={index}><input aria-label={`Poll option ${index + 1}`} value={option} onChange={(event) => setPollOptions((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} maxLength={80} placeholder={`Option ${index + 1}`} required /><button type="button" aria-label={`Remove option ${index + 1}`} disabled={pollOptions.length <= 2} onClick={() => setPollOptions((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></div>)}{pollOptions.length < 6 && <button type="button" onClick={() => setPollOptions((items) => [...items, ''])}><Plus size={14} /> Add option</button>}<label>Close poll (optional)<input type="datetime-local" value={pollExpires} min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} onChange={(event) => setPollExpires(event.target.value)} /></label></div>}
    {error && <p className="form-alert" role="alert">{error}</p>}
    <footer className="community-composer__footer"><div><button type="button" onClick={() => setTitlePicker((value) => !value)}><Plus size={15} /> Link title</button><button type="button" onClick={() => imageInput.current?.click()} disabled={uploading || images.length >= 4}><ImagePlus size={15} /> Image</button><input ref={imageInput} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void addImages(event.target.files)} /><button type="button" className={spoiler ? 'is-active' : ''} onClick={() => setSpoiler((value) => !value)}><Shield size={15} /> Spoiler</button><button type="button" className={pollEnabled ? 'is-active' : ''} onClick={() => setPollEnabled((value) => !value)}><Check size={15} /> Poll</button><CategorySelector value={categories} onChange={setCategories} /></div><Button type="submit" disabled={saving || uploading || !title.trim() || (pollEnabled && (pollOptions.some((item) => !item.trim()) || !pollQuestion.trim()))}><Send size={15} /> {saving ? 'Publishing…' : 'Post'}</Button></footer>
  </form>;
}

function useDeletePost() {
  const client = useQueryClient();
  return async (post: Post) => { await apiRequest(`/community/posts/${post._id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: ['community'] }); };
}

export function CommunityHomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const feedValue = searchParams.get('feed');
  const feed = (['discover', 'following', 'trending'] as const).includes(feedValue as 'discover' | 'following' | 'trending') ? feedValue as 'discover' | 'following' | 'trending' : 'discover';
  const categoryValue = searchParams.get('category') ?? '';
  const category = communityCategories.some((item) => item.value === categoryValue) ? categoryValue as CommunityCategory : '';
  const [composerOpen, setComposerOpen] = useState(Boolean(searchParams.get('titleId')));
  const deletePost = useDeletePost();
  const query = useInfiniteQuery({ queryKey: ['community', 'feed', feed, category, searchParams.get('titleId')], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Post>>(`/community/posts?feed=${feed}&page=${pageParam}&limit=12${category ? `&category=${encodeURIComponent(category)}` : ''}${searchParams.get('titleId') ? `&titleId=${encodeURIComponent(searchParams.get('titleId')!)}` : ''}`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined });
  useCommunityScrollRestore(query.isFetched);
  function updateParam(key: string, value: string) { const next = new URLSearchParams(searchParams); if (value) next.set(key, value); else next.delete(key); setSearchParams(next); }
  useEffect(() => { if (!composerOpen) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setComposerOpen(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [composerOpen]);
  const posts = query.data?.pages.flatMap((page) => page.items) ?? [];
  return <main className="page-wrap community-page"><PageHeading eyebrow="A shared watchline" title="Community" description="Conversations connected to the stories you watch." action={<Link className="button button--outline" to="/community/saved"><Bookmark size={15} /> Saved</Link>} />
    <div className="community-toolbar"><nav className="community-tabs" aria-label="Community feeds">{(['discover', 'following', 'trending'] as const).map((value) => <button type="button" key={value} className={feed === value ? 'is-active' : ''} onClick={() => updateParam('feed', value === 'discover' ? '' : value)}>{value[0]!.toUpperCase() + value.slice(1)}</button>)}</nav><div className="community-toolbar__actions"><Link className="community-search-link" to="/community/search"><Search size={16} /> Search</Link><Button onClick={() => setComposerOpen(true)}><Plus size={15} /> New discussion</Button></div></div>
    <CommunityCategoryFilters selected={category} onSelect={(value) => updateParam('category', value)} />
    {query.isLoading ? <LoadingLine label="Finding discussions" /> : query.error ? <EmptyState title="Community is unavailable" description={query.error instanceof Error ? query.error.message : 'Try again shortly.'} action={<Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>} /> : posts.length ? <div className="community-feed">{posts.map((post) => <PostCard key={post._id} post={post} onDelete={deletePost} />)}</div> : <EmptyState title="Start the conversation" description="Share a thought about a film or series to begin the community feed." />}
    {query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load older discussions'}</Button>}
    {composerOpen && <div className="community-compose-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposerOpen(false); }}><section className="community-compose-dialog" role="dialog" aria-modal="true" aria-labelledby="community-compose-title"><header><div><p className="eyebrow">A shared watchline</p><h2 id="community-compose-title">Create discussion</h2></div><button type="button" className="icon-button" aria-label="Close composer" onClick={() => setComposerOpen(false)}><X size={19} /></button></header><PostComposer initialTitleId={searchParams.get('titleId') ?? undefined} onCreated={() => setComposerOpen(false)} /></section></div>}
  </main>;
}

function CommentThread({ comment, onReply, depth = 0 }: { comment: Comment; onReply: (comment: Comment) => void; depth?: number }) {
  const client = useQueryClient(); const { user } = useAuth();
  const [expanded, setExpanded] = useState(false); const [reporting, setReporting] = useState<string | null>(null); const [editingId, setEditingId] = useState<string | null>(null); const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null); const [deleteBusy, setDeleteBusy] = useState(false); const [deleteError, setDeleteError] = useState(''); const [text, setText] = useState(comment.content); const [error, setError] = useState('');
  const replies = comment.replies ?? [];
  const replyCount = comment.replyCount ?? replies.length;
  const replyQuery = useInfiniteQuery({ queryKey: ['community', 'comment-replies', comment.post, comment._id], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Comment>>(`/community/posts/${comment.post}/comments/${comment._id}/replies?page=${pageParam}&limit=10`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined, enabled: expanded && replyCount > 2 });
  const loadedReplies = replyQuery.data?.pages.flatMap((page) => page.items);
  const visibleReplies = expanded ? loadedReplies ?? replies : replies.slice(0, 2);
  async function edit(item: Comment) { try { await apiRequest(`/community/comments/${item._id}`, { method: 'PATCH', body: JSON.stringify({ content: text, mentionIds: item.mentions?.filter((person) => text.toLowerCase().includes(`@${person.username.toLowerCase()}`)).map((person) => String(person.id ?? person._id)) ?? [] }) }); setEditingId(null); await client.invalidateQueries({ queryKey: ['community', 'comments', comment.post] }); await client.invalidateQueries({ queryKey: ['community', 'comment-replies', comment.post] }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Comment could not be edited.'); } }
  async function remove() { if (!deleteTarget || deleteBusy) return; setDeleteBusy(true); setDeleteError(''); try { await apiRequest(`/community/comments/${deleteTarget._id}`, { method: 'DELETE' }); setDeleteTarget(null); await client.invalidateQueries({ queryKey: ['community', 'comments', comment.post] }); await client.invalidateQueries({ queryKey: ['community', 'comment-replies', comment.post] }); await client.invalidateQueries({ queryKey: ['community', 'post', comment.post] }); } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Comment could not be deleted.'); } finally { setDeleteBusy(false); } }
  function itemView(item: Comment) {
    const own = user?.id === item.author._id || user?.id === item.author.id;
    return <article className="community-comment" key={item._id}><Avatar person={item.author} /><div className="community-comment__body"><header><Link to={`/u/${item.author.username}`}>@{item.author.username}</Link><time>{timeSince(item.createdAt)}{item.editedAt ? ' · edited' : ''}</time></header>{editingId === item._id ? <form onSubmit={(event) => { event.preventDefault(); void edit(item); }}><textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} /><div><Button type="button" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button><Button type="submit" disabled={!text.trim()}>Save</Button></div></form> : <p>{item.deletedAt ? 'This comment was removed.' : <MentionText content={item.content} mentions={item.mentions} />}</p>}<div className="community-comment__actions">{!item.deletedAt && <button type="button" onClick={() => onReply(item)}>Reply</button>}{replyCount > 0 && <span className="community-comment__reply-count">{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>}{own && !item.deletedAt ? <><button type="button" onClick={() => { setText(item.content); setEditingId(item._id); }}>Edit</button><button type="button" onClick={() => { setDeleteError(''); setDeleteTarget(item); }}>Delete</button></> : !own && !item.deletedAt ? <button type="button" onClick={() => setReporting(item._id)}>Report</button> : null}</div>{reporting === item._id && <ReportDialog resourcePath={`/community/comments/${item._id}/report`} label="comment" onClose={() => setReporting(null)} />}<ConfirmDialog open={deleteTarget?._id === item._id} eyebrow="Community reply" title="Delete this comment?" description="The comment will be replaced with a removed notice in this discussion." confirmLabel="Delete comment" busy={deleteBusy} error={deleteError} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} /></div></article>;
  }
  return <article className={`community-comment-thread${depth ? ' community-comment-thread--nested' : ''}`} style={{ '--community-thread-depth': Math.min(depth, 5) } as CSSProperties}>{itemView(comment)}{visibleReplies.length > 0 && <div className="community-comment-thread__replies">{visibleReplies.map((reply) => <CommentThread key={reply._id} comment={reply} onReply={onReply} depth={depth + 1} />)}</div>}{expanded && replyQuery.isLoading && <LoadingLine label="Loading replies" />}{expanded && replyQuery.isError && <p className="community-thread-error" role="alert">Replies could not be loaded. <button type="button" onClick={() => void replyQuery.refetch()}>Try again</button></p>}{replyCount > 2 && !expanded && <button className="community-thread-toggle" type="button" onClick={() => setExpanded(true)}>View {replyCount - 2} more {replyCount - 2 === 1 ? 'reply' : 'replies'}</button>}{expanded && replyQuery.hasNextPage && <button className="community-thread-toggle" type="button" disabled={replyQuery.isFetchingNextPage} onClick={() => void replyQuery.fetchNextPage()}>{replyQuery.isFetchingNextPage ? 'Loading…' : `View ${Math.max(0, replyCount - visibleReplies.length)} more ${replyCount - visibleReplies.length === 1 ? 'reply' : 'replies'}`}</button>}{expanded && replyCount > 2 && <button className="community-thread-toggle" type="button" onClick={() => setExpanded(false)}>Hide replies</button>}{error && <p className="form-alert" role="alert">{error}</p>}</article>;
}

export function CommunityPostPage() {
  const client = useQueryClient(); const navigate = useNavigate(); const location = useLocation(); const { postId = '' } = useParams(); const deletePost = useDeletePost();
  const post = useQuery({ queryKey: ['community', 'post', postId], queryFn: () => apiRequest<{ item: Post }>(`/community/posts/${postId}`), enabled: Boolean(postId) });
  const comments = useInfiniteQuery({ queryKey: ['community', 'comments', postId], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Comment>>(`/community/posts/${postId}/comments?page=${pageParam}&limit=5`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined, enabled: Boolean(post.data) });
  const [draft, setDraft] = useState(''); const [replyTo, setReplyTo] = useState<Comment | null>(null); const [error, setError] = useState(''); const [commentMentions, setCommentMentions] = useState<Person[]>([]); const [commentQueryText, setCommentQueryText] = useState(''); const commentInput = useRef<HTMLTextAreaElement>(null);
  const commentMentionMatch = commentQueryText.match(/(?:^|\s)@([a-zA-Z0-9_]{0,24})$/);
  const commentMentionQuery = useQuery({ queryKey: ['community-comment-mention', commentMentionMatch?.[1]], queryFn: () => apiRequest<Page<Person>>(`/social/people?q=${encodeURIComponent(commentMentionMatch?.[1] ?? '')}&limit=5`), enabled: Boolean(commentMentionMatch) });
  const items = comments.data?.pages.flatMap((page) => page.items) ?? [];
  const replyTarget = replyTo;
  function goBack() { const state = location.state as { communityReturnTo?: string } | null; if (state?.communityReturnTo && state.communityReturnTo.startsWith('/')) navigate(-1); else navigate('/community'); }
  function selectCommentMention(person: Person) { const next = draft.replace(/(?:^|\s)@([a-zA-Z0-9_]{0,24})$/, (match) => `${match.startsWith(' ') ? ' ' : ''}@${person.username} `); setDraft(next); setCommentMentions((items) => [...items.filter((item) => item.username !== person.username), person]); setCommentQueryText(''); commentInput.current?.focus(); }
  async function submit(event: FormEvent) { event.preventDefault(); if (!draft.trim()) return; try { setError(''); await apiRequest(`/community/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content: draft, parentCommentId: replyTo?._id, mentionIds: commentMentions.map((person) => String(person.id ?? person._id)) }) }); setDraft(''); setCommentMentions([]); setCommentQueryText(''); setReplyTo(null); await client.invalidateQueries({ queryKey: ['community', 'comments', postId] }); await client.invalidateQueries({ queryKey: ['community', 'comment-replies', postId] }); await client.invalidateQueries({ queryKey: ['community', 'post', postId] }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Comment could not be posted.'); } }
  if (post.isLoading) return <main className="page-wrap"><LoadingLine label="Opening discussion" /></main>;
  if (!post.data) return <main className="page-wrap"><EmptyState title="Discussion unavailable" description="This discussion may have been removed or is not available to your account." action={<Button variant="outline" onClick={goBack}>Back</Button>} /></main>;
  return <main className="page-wrap community-page community-detail"><button className="community-back" type="button" onClick={goBack}><ChevronLeft size={17} /> Back</button><PostCard post={post.data.item} interactive={false} onOpenComments={() => commentInput.current?.focus()} onDelete={(item) => deletePost(item).then(() => navigate('/community'))} /><section className="community-comments"><h2>Replies <span>{post.data.item.commentCount}</span></h2><form className="community-comment-form" onSubmit={(event) => void submit(event)}>{replyTarget && <div className="community-replying-to"><span>Replying to <strong>@{replyTarget.author.username}</strong></span><button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={14} /></button></div>}<div className="community-comment-form__input">{commentMentionMatch && commentMentionQuery.data?.items.length ? <div className="community-autocomplete">{commentMentionQuery.data.items.map((person) => <button type="button" key={person.id} onClick={() => selectCommentMention(person)}><Avatar person={person} /> @{person.username}</button>)}</div> : null}<textarea ref={commentInput} value={draft} onChange={(event) => { setDraft(event.target.value); setCommentMentions((items) => items.filter((person) => event.target.value.toLowerCase().includes(`@${person.username.toLowerCase()}`))); setCommentQueryText(event.target.value.slice(0, event.target.selectionStart)); }} maxLength={2000} placeholder={replyTarget ? `Reply to @${replyTarget.author.username}…` : 'Add to the conversation…'} aria-label="Write a comment" /></div><Button type="submit" disabled={!draft.trim()}><Send size={15} /> {replyTarget ? 'Reply' : 'Comment'}</Button></form>{error && <p className="form-alert" role="alert">{error}</p>}{comments.isLoading ? <LoadingLine label="Loading replies" /> : items.length ? items.map((comment) => <CommentThread key={comment._id} comment={comment} onReply={(target) => { setReplyTo(target); commentInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); commentInput.current?.focus(); }} />) : <p className="community-muted">No replies yet.</p>}{comments.hasNextPage && <Button className="community-load-more" variant="outline" disabled={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>{comments.isFetchingNextPage ? 'Loading…' : 'View more comments'}</Button>}</section></main>;
}

export function CommunitySavedPage() {
  const deletePost = useDeletePost(); const query = useInfiniteQuery({ queryKey: ['community', 'saved'], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Post>>(`/community/posts/saved?page=${pageParam}&limit=12`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined });
  const posts = query.data?.pages.flatMap((page) => page.items) ?? [];
  useCommunityScrollRestore(query.isFetched);
  return <main className="page-wrap community-page"><PageHeading eyebrow="Kept for later" title="Saved discussions" action={<Link className="inline-arrow" to="/community">Back to Community</Link>} />{query.isLoading ? <LoadingLine /> : posts.length ? <div className="community-feed">{posts.map((post) => <PostCard key={post._id} post={post} onDelete={deletePost} />)}</div> : <EmptyState title="Nothing saved yet" description="Bookmark a discussion to keep it here." />}{query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load more</Button>}</main>;
}

export function CommunitySearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [term, setTerm] = useState(searchParams.get('q') ?? ''); const [debounced, setDebounced] = useState(searchParams.get('q') ?? ''); const [kind, setKind] = useState<'posts' | 'titles' | 'people'>((['posts', 'titles', 'people'] as const).includes(searchParams.get('type') as 'posts' | 'titles' | 'people') ? searchParams.get('type') as 'posts' | 'titles' | 'people' : 'posts'); const deletePost = useDeletePost();
  const categoryValue = searchParams.get('category') ?? ''; const category = communityCategories.some((item) => item.value === categoryValue) ? categoryValue as CommunityCategory : '';
  const client = useQueryClient();
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(term.trim()), 300); return () => window.clearTimeout(timer); }, [term]);
  useEffect(() => { setTerm(searchParams.get('q') ?? ''); setKind((['posts', 'titles', 'people'] as const).includes(searchParams.get('type') as 'posts' | 'titles' | 'people') ? searchParams.get('type') as 'posts' | 'titles' | 'people' : 'posts'); }, [searchParams]);
  function updateSearchParam(key: string, value: string) { const next = new URLSearchParams(searchParams); if (value) next.set(key, value); else next.delete(key); setSearchParams(next, { replace: true }); }
  const postQuery = useInfiniteQuery({ queryKey: ['community', 'search', debounced, category], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Post>>(`/community/search?q=${encodeURIComponent(debounced)}&page=${pageParam}&limit=20${category ? `&category=${encodeURIComponent(category)}` : ''}`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined, enabled: kind === 'posts' && debounced.length >= 2 });
  const titleQuery = useQuery({ queryKey: ['community', 'search-titles', debounced], queryFn: () => apiRequest<{ items: MediaTitle[] }>(`/catalog/search?q=${encodeURIComponent(debounced)}`), enabled: kind === 'titles' && debounced.length >= 2 });
  const peopleQuery = useQuery({ queryKey: ['community', 'search-people', debounced], queryFn: () => apiRequest<Page<Person>>(`/social/people?q=${encodeURIComponent(debounced)}&page=1&limit=20`), enabled: kind === 'people' && debounced.length >= 2 });
  const posts = postQuery.data?.pages.flatMap((page) => page.items) ?? [];
  useCommunityScrollRestore(kind !== 'posts' || postQuery.isFetched);
  async function toggleFollow(person: Person) { try { await apiRequest(`/social/users/${encodeURIComponent(person.username)}/follow`, { method: person.isFollowing ? 'DELETE' : 'POST' }); await client.invalidateQueries({ queryKey: ['community', 'search-people', debounced] }); await client.invalidateQueries({ queryKey: ['social'] }); } catch { /* The row remains available; errors are surfaced by the refreshed relationship state. */ } }
  return <main className="page-wrap community-page"><PageHeading eyebrow="Find a conversation" title="Search Community" action={<Link className="inline-arrow" to="/community">Back to Community</Link>} /><label className="community-search-input"><Search size={17} /><input value={term} onChange={(event) => { setTerm(event.target.value); updateSearchParam('q', event.target.value); }} placeholder={`Search ${kind}`} aria-label="Search community" /></label><nav className="community-search-tabs" aria-label="Search result type">{(['posts', 'titles', 'people'] as const).map((value) => <button type="button" className={kind === value ? 'is-active' : ''} key={value} onClick={() => { setKind(value); updateSearchParam('type', value === 'posts' ? '' : value); }}>{value[0]!.toUpperCase() + value.slice(1)}</button>)}</nav>
    {kind === 'posts' && <CommunityCategoryFilters selected={category} onSelect={(value) => updateSearchParam('category', value)} />}
    {debounced.length < 2 ? <p className="community-muted">Enter at least two characters to search.</p> : kind === 'posts' ? postQuery.isLoading ? <LoadingLine /> : posts.length ? <div className="community-feed">{posts.map((post) => <PostCard key={post._id} post={post} onDelete={deletePost} />)}</div> : <EmptyState title="No discussions found" description="Try a different phrase." /> : kind === 'titles' ? titleQuery.isFetching ? <LoadingLine label="Searching titles" /> : titleQuery.data?.items.length ? <div className="community-result-list">{titleQuery.data.items.map((title) => <Link to={`/app/title/${title._id}`} className="community-title-result" key={title._id}><Poster title={title} size="small" /><span><strong>{title.title}</strong><small>{title.mediaType === 'movie' ? 'Film' : 'Series'}{title.releaseDate ? ` · ${title.releaseDate.slice(0, 4)}` : ''}</small></span><ArrowUpRight size={16} /></Link>)}</div> : <EmptyState title="No matching titles" description="Try another movie or series name." /> : peopleQuery.isFetching ? <LoadingLine label="Finding members" /> : peopleQuery.data?.items.length ? <div className="community-result-list">{peopleQuery.data.items.map((person) => <article className="community-person-result" key={person.id}><Link to={`/u/${person.username}`}><Avatar person={person} /><span><strong>@{person.username}</strong><small>{person.bio || 'Showgraphy member'}</small></span></Link><Button variant={person.isFollowing ? 'outline' : 'primary'} onClick={() => void toggleFollow(person)}>{person.isFollowing ? 'Following' : 'Follow'}</Button></article>)}</div> : <EmptyState title="No members found" description="Try another username." />}
    {kind === 'posts' && postQuery.hasNextPage && <Button variant="outline" disabled={postQuery.isFetchingNextPage} onClick={() => void postQuery.fetchNextPage()}>{postQuery.isFetchingNextPage ? 'Loading…' : 'Load more results'}</Button>}
  </main>;
}

export function TitleDiscussions({ titleId, title }: { titleId: string; title: MediaTitle }) {
  const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const query = useInfiniteQuery({ queryKey: ['community', 'title', titleId, sort], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Post>>(`/community/posts?feed=discover&titleId=${titleId}&sort=${sort}&page=${pageParam}&limit=5`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined });
  const posts = query.data?.pages.flatMap((page) => page.items) ?? [];
  useCommunityScrollRestore(query.isFetched);
  return <section className="community-title-discussions"><div className="section-topline"><div><p className="eyebrow">The conversation continues</p><h2>Discussions about {title.title}</h2></div><Link className="button button--outline" to={`/community?titleId=${titleId}`}><Plus size={15} /> Start discussion</Link></div><nav className="community-search-tabs" aria-label="Title discussion sort"><button type="button" className={sort === 'recent' ? 'is-active' : ''} onClick={() => setSort('recent')}>Recent</button><button type="button" className={sort === 'popular' ? 'is-active' : ''} onClick={() => setSort('popular')}>Popular</button></nav>{query.isLoading ? <LoadingLine /> : posts.length ? <div className="community-feed">{posts.map((post) => <PostCard key={post._id} post={post} />)}</div> : <p className="community-muted">No discussions linked to this title yet.</p>}{query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load more discussions</Button>}<Link className="inline-arrow" to={`/community?titleId=${titleId}`}>Open all discussions <ArrowUpRight size={15} /></Link></section>;
}

export function CommunityProfilePosts({ username }: { username: string }) {
  const query = useInfiniteQuery({ queryKey: ['community', 'profile-posts', username], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Post>>(`/community/posts?author=${encodeURIComponent(username)}&page=${pageParam}&limit=6`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined });
  const posts = query.data?.pages.flatMap((page) => page.items) ?? [];
  useCommunityScrollRestore(query.isFetched);
  if (query.isLoading) return <section className="profile-section"><LoadingLine label={`Loading @${username}'s discussions`} /></section>;
  if (!posts.length) return null;
  return <section className="profile-section community-profile-posts"><div className="section-topline"><div><p className="eyebrow">From the community</p><h2>@{username}'s discussions</h2></div></div><div className="community-feed">{posts.map((post) => <PostCard key={post._id} post={post} />)}</div>{query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load more discussions</Button>}</section>;
}
