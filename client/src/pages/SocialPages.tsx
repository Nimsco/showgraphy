import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Flag, MessageCircle, Search, Send, Shield, UserRound } from 'lucide-react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, LoadingLine, PageHeading, Poster } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, getAccessToken, refreshAccessTokenStatus } from '../lib/api';
import type { MediaTitle } from '../types';

type Person = { id?: string; _id?: string; username: string; avatar: string; bio: string; isFollowing?: boolean; mutualFollowers?: number };
type Page<T> = { items: T[]; page: number; hasMore: boolean };
function directDayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
function keepSocialSocketAuthenticated(socket: Socket, onExpired: () => void) {
  let active = true;
  let refreshing = false;
  let retryTimer = 0;
  const refresh = async () => {
    if (!active || refreshing) return;
    refreshing = true;
    const result = await refreshAccessTokenStatus();
    if (!active) return;
    if (result === 'refreshed') {
      socket.disconnect();
      socket.connect();
      refreshing = false;
    } else if (result === 'retry') {
      refreshing = false;
      retryTimer = window.setTimeout(() => void refresh(), 3000);
    } else {
      refreshing = false;
      onExpired();
    }
  };
  const onAuthExpired = () => { socket.disconnect(); void refresh(); };
  const onConnectError = (error: Error & { data?: { code?: string } }) => {
    if (['AUTH_REQUIRED', 'AUTH_EXPIRED', 'AUTH_REVOKED'].includes(error.data?.code ?? '')) void refresh();
  };
  socket.on('chat:auth-expired', onAuthExpired);
  socket.on('connect_error', onConnectError);
  return () => {
    active = false;
    window.clearTimeout(retryTimer);
    socket.off('chat:auth-expired', onAuthExpired);
    socket.off('connect_error', onConnectError);
  };
}
function UserAvatar({ user, size = 'small' }: { user?: { avatar?: string; username?: string } | null; size?: 'small' | 'large' }) {
  return <span className={`social-avatar social-avatar--${size}`}>{user?.avatar ? <img src={user.avatar} alt="" /> : <UserRound size={size === 'large' ? 23 : 16} />}</span>;
}
function SocialRow({ person, onFollow }: { person: Person; onFollow?: () => void }) {
  return <article className="social-row"><Link to={`/u/${person.username}`} className="social-row__profile"><UserAvatar user={person} /><span><strong>@{person.username}</strong>{person.mutualFollowers ? <small>{person.mutualFollowers} mutual {person.mutualFollowers === 1 ? 'follower' : 'followers'}</small> : person.bio && <small>{person.bio}</small>}</span></Link>{onFollow && <Button variant={person.isFollowing ? 'outline' : 'primary'} onClick={onFollow}>{person.isFollowing ? <><Check size={14} /> Following</> : 'Follow'}</Button>}</article>;
}
function SocialPage({ children }: { children: ReactNode }) { return <main className="page-wrap social-page">{children}</main>; }
function CommunityMenu() { return <nav className="social-community-nav" aria-label="Community pages"><NavLink to="/people">People</NavLink><NavLink to="/following">Following</NavLink><NavLink to="/blocked">Blocked accounts</NavLink></nav>; }

export function PeoplePage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [actionError, setActionError] = useState('');
  const client = useQueryClient();
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);
  const query = useInfiniteQuery({ queryKey: ['social', 'people', debounced], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Person>>(`/social/people?q=${encodeURIComponent(debounced)}&page=${pageParam}&limit=30`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined });
  const people = query.data?.pages.flatMap((page) => page.items) ?? [];
  async function toggle(person: Person) {
    setActionError('');
    try {
      await apiRequest(`/social/users/${encodeURIComponent(person.username)}/follow`, { method: person.isFollowing ? 'DELETE' : 'POST' });
      await client.invalidateQueries({ queryKey: ['social'] });
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'The follow change could not be saved.'); }
  }
  return <SocialPage><CommunityMenu />{actionError && <p className="form-alert" role="alert">{actionError}</p>}<PageHeading eyebrow="Find your people" title="Discover people" description="Follow members who share your taste in film and television." />
    <label className="social-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search usernames" aria-label="Search people" /></label>
    {query.isLoading ? <LoadingLine label="Finding members" /> : query.error ? <EmptyState title="People could not load" description={query.error instanceof Error ? query.error.message : 'Try again shortly.'} action={<Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>} /> : people.length ? <><div className="social-list">{people.map((person) => <SocialRow key={person.id} person={person} onFollow={() => void toggle(person)} />)}</div>{query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more people'}</Button>}</> : <EmptyState title={debounced ? 'No members found' : 'You’re all caught up'} description={debounced ? 'Try another username.' : 'New members will appear here as the community grows.'} />}
  </SocialPage>;
}

type Activity = { id: string; type: 'watched' | 'review' | 'rating'; at: string; user: Person; title: MediaTitle; text?: string; rating?: number };
export function FollowingFeedPage() {
  const query = useInfiniteQuery({ queryKey: ['social', 'feed'], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Activity>>(`/social/feed?page=${pageParam}&limit=30`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined });
  const activities = query.data?.pages.flatMap((page) => page.items) ?? [];
  return <SocialPage><CommunityMenu /><PageHeading eyebrow="From your circle" title="Following" description="Recent films, reviews, and ratings from members you follow." />{query.isLoading ? <LoadingLine label="Gathering activity" /> : query.error ? <EmptyState title="Activity could not load" description="Try again shortly." action={<Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>} /> : activities.length ? <><div className="activity-list">{activities.map((item) => <article className="activity-item" key={`${item.type}-${item.id}`}><UserAvatar user={item.user} /><div className="activity-item__content"><p><Link to={`/u/${item.user.username}`}>@{item.user.username}</Link> {item.type === 'watched' ? 'completed' : item.type === 'rating' ? `rated ${item.rating}/10` : 'reviewed'} <Link to={`/app/title/${item.title._id}`}><strong>{item.title.title}</strong></Link></p>{item.text && <p className="activity-review">“{item.text}”</p>}<time>{new Date(item.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></div><Link to={`/app/title/${item.title._id}`} aria-label={`Open ${item.title.title}`}><Poster title={item.title} size="small" /></Link></article>)}</div>{query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more activity'}</Button>}</> : <EmptyState title="Your feed is quiet" description="Follow a few members to see their movie activity here." action={<Link className="button button--outline" to="/people">Discover people</Link>} />}</SocialPage>;
}

type Notice = { _id: string; type: string; createdAt: string; readAt?: string | null; actor: Person; resourceId?: string; isFollowing?: boolean };
export function NotificationsPage() {
  const client = useQueryClient();
  const { user, logout } = useAuth();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState('');
  const query = useQuery({ queryKey: ['social', 'notifications', unreadOnly, page], queryFn: () => apiRequest<Page<Notice> & { unreadCount: number }>(`/social/notifications?page=${page}&limit=50${unreadOnly ? '&unread=true' : ''}`) });
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const socket = io(import.meta.env.VITE_SOCKET_URL || (import.meta.env.PROD ? 'https://showgraphy.onrender.com' : 'http://localhost:5000'), { path: '/socket.io', transports: ['websocket'], auth: (callback) => callback({ token: getAccessToken() }) });
    const cleanupAuth = keepSocialSocketAuthenticated(socket, () => { if (active) void logout(); });
    socket.on('social:notification', () => { void client.invalidateQueries({ queryKey: ['social', 'notifications'] }); });
    return () => { active = false; cleanupAuth(); socket.disconnect(); };
  }, [user?.id, client, logout]);
  async function markRead(id: string) { try { await apiRequest(`/social/notifications/${id}/read`, { method: 'PATCH' }); await client.invalidateQueries({ queryKey: ['social', 'notifications'] }); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'This notification could not be updated.'); } }
  async function followBack(username: string) { try { await apiRequest(`/social/users/${encodeURIComponent(username)}/follow`, { method: 'POST' }); await client.invalidateQueries({ queryKey: ['social', 'notifications'] }); await client.invalidateQueries({ queryKey: ['social'] }); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'The follow could not be saved.'); } }
  async function markAllRead() { try { await apiRequest('/social/notifications/read-all', { method: 'PATCH' }); await client.invalidateQueries({ queryKey: ['social', 'notifications'] }); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Notifications could not be updated.'); } }
  return <SocialPage>{actionError && <p className="form-alert" role="alert">{actionError}</p>}<PageHeading eyebrow="Your community" title="Notifications" action={Boolean(query.data?.unreadCount) ? <Button variant="outline" onClick={() => void markAllRead()}>Mark all read</Button> : undefined} /><nav className="social-tabs" aria-label="Notification filter"><button type="button" className={!unreadOnly ? 'is-active' : ''} onClick={() => { setUnreadOnly(false); setPage(1); }}>All</button><button type="button" className={unreadOnly ? 'is-active' : ''} onClick={() => { setUnreadOnly(true); setPage(1); }}>Unread {query.data?.unreadCount ? `(${query.data.unreadCount})` : ''}</button></nav>{query.isLoading ? <LoadingLine label="Checking notifications" /> : query.error ? <EmptyState title="Notifications could not load" description={query.error instanceof Error ? query.error.message : 'Try again shortly.'} action={<Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>} /> : query.data?.items.length ? <><div className="social-list">{query.data.items.map((notice) => <article className={`notice-row${notice.readAt ? '' : ' is-unread'}`} key={notice._id} onClick={() => !notice.readAt && void markRead(notice._id)}><UserAvatar user={notice.actor} /><span><Link to={`/u/${notice.actor.username}`}>@{notice.actor.username}</Link> {notice.type === 'follow' ? 'started following you' : notice.type === 'message_request' ? 'sent you a message request' : 'accepted your message request'}<small>{new Date(notice.createdAt).toLocaleString()}</small></span>{notice.type === 'follow' && !notice.isFollowing && <Button variant="outline" onClick={(event) => { event.stopPropagation(); void followBack(notice.actor.username); }}>Follow back</Button>}{notice.type === 'message_request' && <Link className="button button--outline" to="/messages/requests">View request</Link>}</article>)}</div><div className="social-pagination"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Newer</Button><span>Page {page}</span><Button variant="outline" disabled={!query.data.hasMore} onClick={() => setPage((value) => value + 1)}>Older</Button></div></> : <EmptyState title={unreadOnly ? 'All caught up' : 'No notifications yet'} description={unreadOnly ? 'You have no unread notifications.' : 'New followers and message requests will show up here.'} />}</SocialPage>;
}

type Conversation = { id: string; status: 'accepted' | 'pending'; requestedBy?: string; participant: Person; lastMessage: { content: string; senderId: string } | null; lastMessageAt?: string; unread: boolean };
export function MessagesPage({ requests = false }: { requests?: boolean }) {
  const { user, logout } = useAuth();
  const client = useQueryClient();
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const query = useInfiniteQuery({ queryKey: ['social', 'conversations', requests], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Conversation>>(`/social/conversations?page=${pageParam}&limit=50${requests ? '&requests=true' : ''}`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined });
  useEffect(() => {
    if (!user?.id) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || (import.meta.env.PROD ? 'https://showgraphy.onrender.com' : 'http://localhost:5000'), { path: '/socket.io', transports: ['websocket'], auth: (callback) => callback({ token: getAccessToken() }) });
    const cleanupAuth = keepSocialSocketAuthenticated(socket, () => { void logout(); });
    socket.on('dm:presence', ({ userIds }) => setOnlineIds(userIds));
    socket.on('dm:message', () => { void client.invalidateQueries({ queryKey: ['social', 'conversations'] }); });
    socket.on('social:notification', () => { void client.invalidateQueries({ queryKey: ['social', 'notifications'] }); void client.invalidateQueries({ queryKey: ['social', 'conversations'] }); });
    socket.on('disconnect', () => setOnlineIds([]));
    return () => { cleanupAuth(); socket.disconnect(); };
  }, [user?.id, client, logout]);
  const items = (query.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => `${item.participant.username} ${item.lastMessage?.content ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <SocialPage><PageHeading eyebrow="Private conversations" title={requests ? 'Message requests' : 'Messages'} action={<Link className="inline-arrow" to={requests ? '/messages' : '/messages/requests'}>{requests ? 'Inbox' : 'Requests'} <MessageCircle size={15} /></Link>} /><label className="social-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>{query.isLoading ? <LoadingLine label="Opening your inbox" /> : query.error ? <EmptyState title="Messages could not load" description={query.error instanceof Error ? query.error.message : 'Try again shortly.'} action={<Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>} /> : items.length ? <><div className="social-list">{items.map((item) => { const personId = String(item.participant.id ?? item.participant._id ?? ''); return <Link className={`conversation-row${item.unread ? ' is-unread' : ''}`} key={item.id} to={`/messages/${item.id}`}><span className="conversation-row__avatar"><UserAvatar user={item.participant} />{onlineIds.includes(personId) && <i aria-label="Online" />}</span><span><strong>@{item.participant.username}</strong><small>{item.lastMessage?.content ?? (item.status === 'pending' ? 'Message request' : 'Start a conversation')}</small></span><time>{item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</time>{item.unread && <i />}</Link>; })}</div>{query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more conversations'}</Button>}</> : <EmptyState title={search ? 'No conversations found' : requests ? 'No message requests' : 'Your inbox is empty'} description={search ? 'Try another name or message.' : requests ? 'Requests from other members will appear here.' : 'Visit a member’s profile and choose Message to start a conversation.'} action={query.hasNextPage ? <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Search older conversations'}</Button> : !requests && !search ? <Link className="button button--outline" to="/people">Discover people</Link> : undefined} />}</SocialPage>;
}

type DirectMessage = { _id: string; conversationId?: string; content: string; senderId: string | Person; createdAt: string; clientMessageId?: string };
export function ConversationPage() {
  const { conversationId = '' } = useParams();
  const { user, logout } = useAuth();
  const client = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [someoneTyping, setSomeoneTyping] = useState(false);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const typingSelfRef = useRef(false);
  const navigate = useNavigate();
  const conversationQuery = useQuery({ queryKey: ['social', 'conversation', conversationId], queryFn: () => apiRequest<Conversation>(`/social/conversations/${conversationId}`), enabled: Boolean(conversationId) });
  const conversation = conversationQuery.data;
  const messages = useQuery({ queryKey: ['social', 'messages', conversationId], queryFn: () => apiRequest<Page<DirectMessage>>(`/social/conversations/${conversationId}/messages?limit=50`), enabled: Boolean(conversationId && conversation) });
  const lastMessageId = messages.data?.items.at(-1)?._id ?? null;
  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container || !lastMessageId || lastMessageId === lastMessageIdRef.current) return;
    const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 140;
    if (!lastMessageIdRef.current || wasNearBottom) container.scrollTo({ top: container.scrollHeight, behavior: lastMessageIdRef.current ? 'smooth' : 'auto' });
    lastMessageIdRef.current = lastMessageId;
  }, [lastMessageId]);
  useEffect(() => { if (conversation?.status === 'accepted') { void apiRequest(`/social/conversations/${conversationId}/read`, { method: 'PATCH' }).then(() => client.invalidateQueries({ queryKey: ['social', 'conversations'] })); } }, [conversation?.status, conversationId, client]);
  useEffect(() => {
    if (!user?.id || !conversation) return;
    let active = true;
    let refreshing = false;
    let refreshTimer = 0;
    const socket = io(import.meta.env.VITE_SOCKET_URL || (import.meta.env.PROD ? 'https://showgraphy.onrender.com' : 'http://localhost:5000'), { path: '/socket.io', transports: ['websocket'], auth: (callback) => callback({ token: getAccessToken() }) });
    socketRef.current = socket;
    const refresh = async () => {
      if (!active || refreshing) return;
      refreshing = true;
      const result = await refreshAccessTokenStatus();
      if (!active) return;
      if (result === 'refreshed') { socket.disconnect(); socket.connect(); }
      else if (result === 'retry') { refreshTimer = window.setTimeout(() => { refreshing = false; void refresh(); }, 3000); return; }
      else { setError('Your sign-in expired. Sign in again to continue this conversation.'); await logout(); }
      refreshing = false;
    };
    socket.on('connect', () => socket.emit('dm:join', { conversationId }, (result: { ok: boolean; message?: string }) => { if (!result.ok) setError(result.message ?? 'Conversation could not be opened.'); else { if (conversation.status === 'accepted') socket.emit('dm:read', { conversationId }); void client.invalidateQueries({ queryKey: ['social', 'messages', conversationId] }); } }));
    socket.on('dm:message', ({ conversationId: id }) => { if (id === conversationId) void client.invalidateQueries({ queryKey: ['social', 'messages', conversationId] }); void client.invalidateQueries({ queryKey: ['social', 'conversations'] }); });
    socket.on('dm:read', ({ conversationId: id }) => { if (id === conversationId) void client.invalidateQueries({ queryKey: ['social', 'conversations'] }); });
    socket.on('dm:typing', ({ conversationId: id, typing, username }) => { if (id === conversationId && username !== user.username) setSomeoneTyping(typing); });
    socket.on('dm:presence', ({ userIds }) => setOnlineIds(userIds));
    socket.on('chat:auth-expired', () => { socket.disconnect(); void refresh(); });
    socket.on('connect_error', (error) => { const code = (error as Error & { data?: { code?: string } }).data?.code; if (code === 'AUTH_REQUIRED' || code === 'AUTH_EXPIRED' || code === 'AUTH_REVOKED') void refresh(); });
    return () => { active = false; window.clearTimeout(refreshTimer); if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current); if (typingSelfRef.current) socket.emit('dm:typing', { conversationId, typing: false }); typingSelfRef.current = false; socket.disconnect(); socketRef.current = null; };
  }, [user?.id, user?.username, conversation?.status, conversationId, client, logout]);
  function updateMessageDraft(value: string) {
    setDraft(value);
    const socket = socketRef.current;
    if (value.trim()) {
      if (!typingSelfRef.current) { typingSelfRef.current = true; socket?.emit('dm:typing', { conversationId, typing: true }); }
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => { typingSelfRef.current = false; socket?.emit('dm:typing', { conversationId, typing: false }); }, 1800);
    } else {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
      if (typingSelfRef.current) socket?.emit('dm:typing', { conversationId, typing: false });
      typingSelfRef.current = false;
    }
  }
  async function send(event: FormEvent) { event.preventDefault(); const content = draft.trim(); if (!content || !user) return; if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null; if (typingSelfRef.current) socketRef.current?.emit('dm:typing', { conversationId, typing: false }); typingSelfRef.current = false; const clientMessageId = crypto.randomUUID(); const optimistic: DirectMessage = { _id: `pending-${clientMessageId}`, conversationId, content, senderId: user.id, clientMessageId, createdAt: new Date().toISOString() }; client.setQueryData<Page<DirectMessage>>(['social', 'messages', conversationId], (current) => ({ items: [...(current?.items ?? []), optimistic], hasMore: current?.hasMore ?? false, page: current?.page ?? 1 })); setDraft(''); setError(''); try { const socket = socketRef.current; if (socket?.connected) { await new Promise<void>((resolve, reject) => socket.emit('dm:send', { conversationId, content, clientMessageId }, (result: { ok: boolean; message?: string; code?: string }) => result.ok ? resolve() : reject(new Error(result.message ?? 'Message could not be sent.')))); } else { await apiRequest(`/social/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content, clientMessageId }) }); } await Promise.all([client.invalidateQueries({ queryKey: ['social', 'messages', conversationId] }), client.invalidateQueries({ queryKey: ['social', 'conversations'] })]); } catch (cause) { client.setQueryData<Page<DirectMessage>>(['social', 'messages', conversationId], (current) => current ? { ...current, items: current.items.filter((message) => message.clientMessageId !== clientMessageId) } : current); setDraft(content); setError(cause instanceof Error ? cause.message : 'Message could not be sent.'); } }
  async function loadOlderMessages() {
    const first = messages.data?.items[0];
    if (!first || !messages.data?.hasMore || loadingOlder) return;
    const container = messagesScrollRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    const previousTop = container?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const older = await apiRequest<Page<DirectMessage>>(`/social/conversations/${conversationId}/messages?limit=50&before=${encodeURIComponent(first._id)}`);
      client.setQueryData<Page<DirectMessage>>(['social', 'messages', conversationId], (current) => current ? { ...current, items: [...older.items, ...current.items], hasMore: older.hasMore } : current);
      window.requestAnimationFrame(() => { if (container) container.scrollTop = previousTop + container.scrollHeight - previousHeight; });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Older messages could not load.'); }
    finally { setLoadingOlder(false); }
  }
  async function reportMessage(message: DirectMessage) {
    if (!participant || !window.confirm('Send this message to the moderation team for review?')) return;
    try { await apiRequest('/social/reports', { method: 'POST', body: JSON.stringify({ username: participant.username, messageId: message._id, reason: 'other' }) }); setError('Report received. Thank you.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The report could not be sent.'); }
  }
  async function requestAction(action: 'accept' | 'decline') {
    setError('');
    try {
      await apiRequest(`/social/conversations/${conversationId}/${action}`, { method: 'PATCH' });
      await client.invalidateQueries({ queryKey: ['social'] });
      if (action === 'decline') navigate('/messages/requests');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The message request could not be updated.'); }
  }
  const participant = conversation?.participant;
  if (conversationQuery.isLoading) return <main className="social-page conversation-page"><LoadingLine label="Opening conversation" /></main>;
  if (conversationQuery.error || !conversation) return <main className="social-page conversation-page"><EmptyState title="Conversation unavailable" description={conversationQuery.error instanceof Error ? conversationQuery.error.message : 'This conversation is no longer available.'} action={<Link className="button button--outline" to="/messages">Back to messages</Link>} /></main>;
  const participantId = String(participant?.id ?? participant?._id ?? '');
  return <main className="social-page conversation-page"><header className="conversation-header"><Link to="/messages" className="icon-button" aria-label="Back to inbox"><ArrowLeft size={18} /></Link><UserAvatar user={participant} /><span className="conversation-header__identity"><strong>@{participant?.username ?? 'Conversation'}</strong><small>{onlineIds.includes(participantId) ? 'Online' : 'Offline'}</small></span><Link className="inline-arrow" to={participant ? `/u/${participant.username}` : '/messages'}>Profile</Link></header>{error && <p className="form-alert" role="alert">{error}</p>}
    {conversation?.status === 'pending' ? <section className="request-panel"><p>{conversation.requestedBy === user?.id ? 'Your message request is waiting for a reply.' : 'This member sent you a message request.'}</p>{conversation.lastMessage && <blockquote>{conversation.lastMessage.content}</blockquote>}{conversation.requestedBy === user?.id && !conversation.lastMessage && <form className="direct-composer request-composer" onSubmit={send}><label className="visually-hidden" htmlFor="direct-message-content">Write your message request</label><textarea id="direct-message-content" rows={2} maxLength={2000} value={draft} onChange={(event) => updateMessageDraft(event.target.value)} placeholder="Write a short message request…" /><Button type="submit" disabled={!draft.trim()}><Send size={16} /> Send request</Button></form>}{conversation.requestedBy !== user?.id && <div><Button onClick={() => void requestAction('accept')}>Accept</Button><Button variant="outline" onClick={() => void requestAction('decline')}>Decline</Button></div>}</section> : <>
      {messages.isLoading ? <LoadingLine label="Loading conversation" /> : messages.error ? <EmptyState title="Conversation could not load" description={messages.error instanceof Error ? messages.error.message : 'Try again shortly.'} action={<Button variant="outline" onClick={() => void messages.refetch()}>Try again</Button>} /> : <div className="direct-messages" ref={messagesScrollRef}>{messages.data?.hasMore && <button className="chat-history-more" type="button" disabled={loadingOlder} onClick={() => void loadOlderMessages()}>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</button>}{messages.data?.items.map((message, index, items) => { const senderId = typeof message.senderId === 'string' ? message.senderId : message.senderId?._id; const own = senderId === user?.id; const day = new Date(message.createdAt).toDateString(); const previousDay = index > 0 ? new Date(items[index - 1]!.createdAt).toDateString() : ''; return <Fragment key={message._id}>{day !== previousDay && <div className="direct-date"><span>{directDayLabel(message.createdAt)}</span></div>}<article className={`direct-message${own ? ' is-own' : ''}`}><p>{message.content}</p><time>{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>{!own && !message._id.startsWith('pending-') && <button className="direct-message__report" type="button" onClick={() => void reportMessage(message)} aria-label="Report message"><Flag size={12} /></button>}</article></Fragment>; })}</div>}
      {someoneTyping && <p className="direct-typing">Someone is typing…</p>}<form className="direct-composer" onSubmit={send}><label className="visually-hidden" htmlFor="direct-message-content">Write a message</label><textarea id="direct-message-content" rows={1} maxLength={2000} value={draft} onChange={(event) => updateMessageDraft(event.target.value)} placeholder="Write a message…" /> <Button type="submit" disabled={!draft.trim()} aria-label="Send message"><Send size={16} /></Button></form>
    </>}
  </main>;
}

export function ConnectionsPage({ type }: { type: 'followers' | 'following' }) {
  const { username = '' } = useParams();
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState('');
  const query = useInfiniteQuery({ queryKey: ['social', type, username], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Person>>(`/social/users/${encodeURIComponent(username)}/${type}?page=${pageParam}&limit=50`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined });
  const people = (query.data?.pages.flatMap((page) => page.items) ?? []).filter((person) => `${person.username} ${person.bio}`.toLowerCase().includes(search.trim().toLowerCase()));
  const client = useQueryClient();
  async function toggle(person: Person) {
    setActionError('');
    try {
      await apiRequest(`/social/users/${encodeURIComponent(person.username)}/follow`, { method: person.isFollowing ? 'DELETE' : 'POST' });
      await client.invalidateQueries({ queryKey: ['social'] });
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'The follow change could not be saved.'); }
  }
  return <SocialPage>{actionError && <p className="form-alert" role="alert">{actionError}</p>}<Link className="inline-arrow" to={`/u/${username}`}><ArrowLeft size={15} /> @{username}</Link><PageHeading eyebrow={`@${username}`} title={type === 'followers' ? 'Followers' : 'Following'} /><nav className="social-tabs" aria-label="Connection lists"><Link to={`/u/${username}/followers`}>Followers</Link><Link to={`/u/${username}/following`}>Following</Link></nav><label className="social-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this list" aria-label={`Search ${type}`} /></label>{query.isLoading ? <LoadingLine /> : query.error ? <EmptyState title="Connections could not load" description={query.error instanceof Error ? query.error.message : 'Try again shortly.'} action={<Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>} /> : people.length ? <><div className="social-list">{people.map((person) => <SocialRow key={person.id ?? person._id} person={person} onFollow={() => void toggle(person)} />)}</div>{query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more'}</Button>}</> : <EmptyState title={search ? 'No members found' : 'No members here yet'} description={search ? 'Try another username or bio.' : 'This list is empty right now.'} action={query.hasNextPage ? <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Search older members</Button> : undefined} />}</SocialPage>;
}

export function BlockedUsersPage() {
  const client = useQueryClient();
  const [actionError, setActionError] = useState('');
  const query = useInfiniteQuery({ queryKey: ['social', 'blocks'], initialPageParam: 1, queryFn: ({ pageParam }) => apiRequest<Page<Person>>(`/social/blocks?page=${pageParam}&limit=50`), getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined });
  const people = query.data?.pages.flatMap((page) => page.items) ?? [];
  async function unblock(person: Person) {
    setActionError('');
    try {
      await apiRequest(`/social/users/${encodeURIComponent(person.username)}/block`, { method: 'DELETE' });
      await client.invalidateQueries({ queryKey: ['social', 'blocks'] });
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'This member could not be unblocked.'); }
  }
  return <SocialPage><CommunityMenu />{actionError && <p className="form-alert" role="alert">{actionError}</p>}<PageHeading eyebrow="Your boundaries" title="Blocked accounts" description="Blocked members cannot follow or message you." />{query.isLoading ? <LoadingLine label="Loading blocked accounts" /> : query.error ? <EmptyState title="Blocked accounts could not load" description={query.error instanceof Error ? query.error.message : 'Try again shortly.'} action={<Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>} /> : people.length ? <><div className="social-list">{people.map((person) => <article className="social-row" key={person.id ?? person._id}><Link className="social-row__profile" to={`/u/${person.username}`}><UserAvatar user={person} /><span><strong>@{person.username}</strong></span></Link><Button variant="outline" onClick={() => void unblock(person)}><Shield size={14} /> Unblock</Button></article>)}</div>{query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more'}</Button>}</> : <EmptyState title="No blocked accounts" description="Accounts you block will appear here." />}</SocialPage>;
}
