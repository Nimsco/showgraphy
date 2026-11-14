import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Flag, MessageCircle, Send, Trash2, UserRound, Wifi, WifiOff, X } from 'lucide-react';
import { Button, LoadingLine } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, getAccessToken, refreshAccessTokenStatus } from '../lib/api';
import type { ChatAck, ChatClientToServerEvents, ChatMessage, ChatPage, ChatServerToClientEvents, ChatTypingEvent } from '../types/chat';

type ChatSocket = Socket<ChatServerToClientEvents, ChatClientToServerEvents>;
type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'session-expired';
type ReportReason = 'spam' | 'harassment' | 'hate-speech' | 'other';
const MESSAGE_LIMIT = 1000;
const HISTORY_PAGE_SIZE = 50;

function socketUrl() {
  const configured = import.meta.env.VITE_SOCKET_URL;
  if (configured) return configured.replace(/\/$/, '');
  return import.meta.env.PROD ? 'https://showgraphy.onrender.com' : 'http://localhost:5000';
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((left, right) => {
    const order = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return order || left.id.localeCompare(right.id);
  });
}

function dayLabel(isoDate: string) {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function connectionLabel(state: ConnectionState) {
  if (state === 'connected') return 'Connected';
  if (state === 'session-expired') return 'Refreshing your session';
  if (state === 'reconnecting') return 'Reconnecting';
  return 'Connecting';
}

export function GlobalChatPage() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [onlineCount, setOnlineCount] = useState(0);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('other');
  const [reportDetails, setReportDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportNotice, setReportNotice] = useState('');
  const socketRef = useRef<ChatSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const scrollRestoreRef = useRef<{ height: number; top: number } | null>(null);
  const pendingMessageRef = useRef<{ text: string; id: string } | null>(null);
  const typingTimersRef = useRef<Map<string, number>>(new Map());
  const typingSelfRef = useRef(false);

  const appendMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => {
      const next = mergeMessages(current, incoming);
      messagesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    async function loadInitialHistory() {
      setLoadingHistory(true);
      try {
        const page = await apiRequest<ChatPage>(`/chat/messages?limit=${HISTORY_PAGE_SIZE}`);
        if (!active) return;
        appendMessages(page.items);
        setOlderCursor(page.nextCursor);
        setHasOlder(page.hasMore);
        setError('');
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Previous messages could not be loaded.');
      } finally { if (active) setLoadingHistory(false); }
    }
    void loadInitialHistory();
    return () => { active = false; };
  }, [appendMessages]);

  const loadMessagesAfterReconnect = useCallback(async () => {
    let cursor: string = messagesRef.current.at(-1)?.id ?? '';
    if (!cursor) return;
    try {
      for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
        const page: ChatPage = await apiRequest<ChatPage>(`/chat/messages?after=${encodeURIComponent(cursor)}&limit=100`);
        appendMessages(page.items);
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
      }
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? `Reconnected, but some recent messages may not be loaded. ${cause.message}` : 'Reconnected, but recent messages could not be synchronized.');
    }
  }, [appendMessages]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    let hasConnected = false;
    let refreshInFlight = false;
    let refreshDelay = 1000;
    let refreshTimer = 0;
    const socket = io(socketUrl(), {
      path: '/socket.io',
      transports: ['websocket'],
      timeout: 20_000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      auth: (callback) => callback({ token: getAccessToken() }),
    }) as ChatSocket;
    socketRef.current = socket;

    const refreshAndReconnect = async () => {
      if (!active || refreshInFlight) return;
      refreshInFlight = true;
      setConnection('session-expired');
      try {
        const refreshResult = await refreshAccessTokenStatus();
        if (!active) return;
        if (refreshResult === 'refreshed') {
          refreshDelay = 1000;
          if (socket.connected) socket.disconnect();
          socket.connect();
        } else if (refreshResult === 'unauthorized') {
          setConnection('session-expired');
          await logout();
        } else {
          setConnection('reconnecting');
          window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(() => { refreshInFlight = false; void refreshAndReconnect(); }, refreshDelay);
          refreshDelay = Math.min(refreshDelay * 2, 30_000);
        }
      } finally { refreshInFlight = false; }
    };

    socket.on('connect', () => {
      setConnection('connected');
      if (hasConnected) void loadMessagesAfterReconnect();
      hasConnected = true;
    });
    socket.on('connect_error', (connectError) => {
      const code = (connectError as Error & { data?: { code?: string } }).data?.code;
      if (code === 'AUTH_REQUIRED' || code === 'AUTH_EXPIRED' || code === 'AUTH_REVOKED') {
        void refreshAndReconnect();
      } else {
        setConnection('reconnecting');
      }
    });
    socket.on('disconnect', () => { if (active) setConnection('reconnecting'); typingSelfRef.current = false; });
    socket.io.on('reconnect_attempt', () => { if (active) setConnection('reconnecting'); });
    socket.on('chat:auth-expired', () => {
      setConnection('session-expired');
      socket.disconnect();
      void refreshAndReconnect();
    });
    socket.on('chat:message', (message) => appendMessages([message]));
    socket.on('chat:presence', ({ onlineCount: count }) => setOnlineCount(count));
    socket.on('chat:typing', (event: ChatTypingEvent) => {
      if (event.username === user.username) return;
      setTypingNames((current) => event.typing
        ? current.includes(event.username) ? current : [...current, event.username]
        : current.filter((name) => name !== event.username));
      const priorTimer = typingTimersRef.current.get(event.username);
      if (priorTimer) window.clearTimeout(priorTimer);
      if (event.typing) {
        const timer = window.setTimeout(() => {
          setTypingNames((current) => current.filter((name) => name !== event.username));
          typingTimersRef.current.delete(event.username);
        }, 3500);
        typingTimersRef.current.set(event.username, timer);
      } else typingTimersRef.current.delete(event.username);
    });

    const retryWhenOnline = () => {
      if (!socket.connected && !socket.active) {
        socket.auth = (callback) => callback({ token: getAccessToken() });
        socket.connect();
      }
    };
    window.addEventListener('online', retryWhenOnline);

    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
      window.removeEventListener('online', retryWhenOnline);
      typingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      typingTimersRef.current.clear();
      typingSelfRef.current = false;
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, user?.username, logout, appendMessages, loadMessagesAfterReconnect]);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    if (scrollRestoreRef.current) {
      const position = scrollRestoreRef.current;
      viewport.scrollTop = position.top + viewport.scrollHeight - position.height;
      scrollRestoreRef.current = null;
    } else if (stickToBottomRef.current) viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length]);

  const loadOlderMessages = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!oldest || !hasOlder || loadingOlder) return;
    const viewport = scrollRef.current;
    if (viewport) scrollRestoreRef.current = { height: viewport.scrollHeight, top: viewport.scrollTop };
    setLoadingOlder(true);
    try {
      const page = await apiRequest<ChatPage>(`/chat/messages?before=${encodeURIComponent(olderCursor || oldest.id)}&limit=${HISTORY_PAGE_SIZE}`);
      appendMessages(page.items);
      setOlderCursor(page.nextCursor);
      setHasOlder(page.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Older messages could not be loaded.');
      scrollRestoreRef.current = null;
    } finally { setLoadingOlder(false); }
  }, [appendMessages, hasOlder, loadingOlder, olderCursor]);

  function onMessageScroll() {
    const viewport = scrollRef.current;
    if (!viewport) return;
    stickToBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 110;
    if (viewport.scrollTop < 70 && hasOlder && !loadingOlder) void loadOlderMessages();
  }

  function updateDraft(value: string) {
    setDraft(value);
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (value.trim() && !typingSelfRef.current) {
      typingSelfRef.current = true;
      socket.emit('chat:typing', { typing: true });
    }
    const currentTimer = typingTimersRef.current.get('__self__');
    if (currentTimer) window.clearTimeout(currentTimer);
    if (value.trim()) {
      typingTimersRef.current.set('__self__', window.setTimeout(() => {
        socket.emit('chat:typing', { typing: false });
        typingSelfRef.current = false;
        typingTimersRef.current.delete('__self__');
      }, 900));
    } else {
      socket.emit('chat:typing', { typing: false });
      typingSelfRef.current = false;
      typingTimersRef.current.delete('__self__');
    }
  }

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.replace(/\r\n?/g, '\n').trim();
    const socket = socketRef.current;
    if (!text || text.length > MESSAGE_LIMIT || sending || !socket?.connected) return;
    setSending(true);
    setError('');
    let pending = pendingMessageRef.current;
    if (!pending || pending.text !== text) {
      pending = { text, id: crypto.randomUUID() };
      pendingMessageRef.current = pending;
    }
    socket.timeout(8_000).emit('chat:send', { clientMessageId: pending.id, text }, (timeoutError, result: ChatAck) => {
      setSending(false);
      if (timeoutError) {
        setError('The send timed out. Your message is still here; try sending it again.');
        return;
      }
      if (!result?.ok) {
        setError(result?.message || 'The message could not be sent. Your draft is still here.');
        return;
      }
      appendMessages([result.message]);
      if (draft.trim() === text) updateDraft('');
      pendingMessageRef.current = null;
      setNotice('Message sent.');
      window.setTimeout(() => setNotice(''), 1800);
    });
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  }

  function deleteMessage() {
    const socket = socketRef.current;
    if (!deleteTarget || !socket?.connected) return;
    setDeleteBusy(true);
    socket.timeout(8_000).emit('chat:delete', { messageId: deleteTarget.id }, (timeoutError, result) => {
      setDeleteBusy(false);
      if (timeoutError || !result?.ok) {
        setError(result?.message || 'The message could not be removed.');
        return;
      }
      setDeleteTarget(null);
    });
  }

  async function reportMessage(event: FormEvent) {
    event.preventDefault();
    if (!reportTarget || reportBusy) return;
    setReportBusy(true);
    setError('');
    try {
      await apiRequest(`/chat/messages/${encodeURIComponent(reportTarget.id)}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reportReason, details: reportDetails }),
      });
      setReportTarget(null);
      setReportDetails('');
      setReportNotice('Report received. Thank you for helping keep the chat safe.');
      window.setTimeout(() => setReportNotice(''), 4500);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The report could not be sent.'); }
    finally { setReportBusy(false); }
  }

  let previousDay = '';
  let previousMessage: ChatMessage | undefined;
  const displayMessages = messages.map((message) => {
    const day = new Date(message.createdAt).toDateString();
    const showDay = day !== previousDay;
    const continues = previousMessage?.authorId === message.authorId
      && Date.parse(message.createdAt) - Date.parse(previousMessage.createdAt) < 5 * 60_000
      && !previousMessage.deletedAt && !message.deletedAt;
    previousDay = day;
    previousMessage = message;
    return { message, showDay, continues };
  });

  return <div className="page-wrap chat-page">
    {(error || notice || reportNotice) && <p className={error ? 'form-alert' : 'success-banner'} role={error ? 'alert' : 'status'}>{error || reportNotice || notice}<button type="button" aria-label="Dismiss message" onClick={() => { setError(''); setNotice(''); setReportNotice(''); }}><X size={15} /></button></p>}
    <section className="chat-shell" aria-label="Global Chat">
      <header className="chat-header">
        <span className="chat-online"><i aria-hidden="true" />{onlineCount} online</span>
        <span className={`chat-connection chat-connection--${connection}`} role="status" aria-live="polite">{connection === 'connected' ? <Wifi size={13} /> : connection === 'reconnecting' || connection === 'session-expired' ? <WifiOff size={13} /> : <span className="loading-dot" />}{connectionLabel(connection)}</span>
      </header>
      <div className="chat-messages" ref={scrollRef} onScroll={onMessageScroll} role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions text">
        {(loadingOlder || hasOlder) && <div className="chat-history-control">{loadingOlder ? <span>Loading older messages…</span> : <button type="button" onClick={() => void loadOlderMessages()}>Load older messages</button>}</div>}
        {loadingHistory && !messages.length ? <LoadingLine label="Opening the conversation" /> : !messages.length ? <div className="chat-empty"><MessageCircle size={22} /><h3>Start the conversation</h3><p>Say hello or share what’s on your watchlist.</p></div> : displayMessages.map(({ message, showDay, continues }) => <Fragment key={message.id}>
          {showDay && <div className="chat-date"><span>{dayLabel(message.createdAt)}</span></div>}
          <article className={`chat-message${message.authorId === user?.id ? ' chat-message--own' : ''}${continues ? ' chat-message--continuation' : ''}${message.deletedAt ? ' chat-message--deleted' : ''}`}>
            <div className="chat-message__avatar">{message.avatar ? <img src={message.avatar} alt="" loading="lazy" /> : <UserRound size={16} />}</div>
            <div className="chat-message__body">
              {!continues && <header><strong>@{message.username}</strong><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time></header>}
              <div className="chat-message__bubble"><p>{message.deletedAt ? 'This message was deleted.' : message.text}</p>
                {!message.deletedAt && <div className="chat-message__actions">{message.authorId === user?.id ? <button type="button" aria-label="Delete your message" title="Delete your message" onClick={() => setDeleteTarget(message)}><Trash2 size={13} /></button> : <button type="button" aria-label={`Report message from ${message.username}`} title="Report message" onClick={() => { setReportTarget(message); setReportReason('other'); setReportDetails(''); }}><Flag size={13} /></button>}</div>}
              </div>
            </div>
          </article>
        </Fragment>)}
        {typingNames.length > 0 && <p className="chat-typing" aria-live="polite">{typingNames.length === 1 ? `@${typingNames[0]} is typing` : `${typingNames.length} people are typing`}<span>•••</span></p>}
      </div>
      <form className="chat-composer" onSubmit={sendMessage}>
        <label className="visually-hidden" htmlFor="global-chat-message">Write a message</label>
        <textarea id="global-chat-message" value={draft} onChange={(event) => updateDraft(event.target.value.slice(0, MESSAGE_LIMIT))} onKeyDown={onComposerKeyDown} maxLength={MESSAGE_LIMIT} rows={1} placeholder={connection === 'connected' ? 'Message Global Chat…' : 'Draft while reconnecting…'} aria-describedby="chat-composer-hint" />
        <div className="chat-composer__footer"><span id="chat-composer-hint">Enter to send · Shift + Enter for a new line · {draft.length}/{MESSAGE_LIMIT}</span><Button type="submit" disabled={!draft.trim() || draft.trim().length > MESSAGE_LIMIT || sending || connection !== 'connected'}><Send size={15} />{sending ? 'Sending…' : 'Send'}</Button></div>
      </form>
    </section>
    {reportTarget && <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !reportBusy) setReportTarget(null); }}><section className="dialog-panel chat-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-report-title"><div className="dialog-header"><div><p className="eyebrow">Keep the room welcoming</p><h2 id="chat-report-title">Report this message</h2></div><button type="button" className="icon-button" aria-label="Close report dialog" disabled={reportBusy} onClick={() => setReportTarget(null)}><X size={18} /></button></div><p className="chat-dialog__quote">“{reportTarget.text.slice(0, 180)}” · @{reportTarget.username}</p><form onSubmit={reportMessage}><label htmlFor="chat-report-reason">Reason<select id="chat-report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value as ReportReason)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="hate-speech">Hate speech</option><option value="other">Other</option></select></label><label htmlFor="chat-report-details">Details (optional)<textarea id="chat-report-details" rows={3} maxLength={500} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Add context for the moderation team" /></label><div className="dialog-actions"><Button type="button" variant="outline" disabled={reportBusy} onClick={() => setReportTarget(null)}>Cancel</Button><Button type="submit" disabled={reportBusy}>{reportBusy ? 'Sending…' : 'Send report'}</Button></div></form></section></div>}
    {deleteTarget && <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteBusy) setDeleteTarget(null); }}><section className="dialog-panel confirm-dialog chat-dialog" role="alertdialog" aria-modal="true" aria-labelledby="chat-delete-title"><div className="dialog-header"><div><p className="eyebrow">Remove your message</p><h2 id="chat-delete-title">Delete this message?</h2></div><button type="button" className="icon-button" aria-label="Close confirmation" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}><X size={18} /></button></div><p>This removes the message text for everyone in Global Chat.</p><div className="dialog-actions"><Button variant="outline" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="danger" disabled={deleteBusy} onClick={deleteMessage}>{deleteBusy ? 'Removing…' : 'Delete message'}</Button></div></section></div>}
  </div>;
}
