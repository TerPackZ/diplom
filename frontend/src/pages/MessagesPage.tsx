import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../context/SocketContext';
import apiClient from '../api/client';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { SkeletonConversationRow, SkeletonMessage } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';

// ── Types ────────────────────────────────────────────────────────────────────

interface OtherUser {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Group {
  id: number;
  name: string;
}

interface LastMessage {
  id: number;
  content: string;
  created_at: string;
  display_name: string | null;
  username: string;
}

interface Conversation {
  id: number;
  type: 'direct' | 'group';
  group_id: number | null;
  created_at: string;
  other_user?: OtherUser;
  group?: Group;
  member_count?: number;
  last_message: LastMessage | null;
  unread_count: number;
  is_muted: boolean;
  other_last_read_id: number;
}

interface ReplyInfo {
  id: number;
  content: string;
  user_id: number;
  is_deleted: number;
  attachment_original: string | null;
  attachment_mime: string | null;
  username: string;
  display_name: string | null;
}

interface Message {
  id: number;
  conversation_id: number;
  user_id: number;
  content: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  attachment_filename: string | null;
  attachment_original: string | null;
  attachment_size: number | null;
  attachment_mime: string | null;
  reply_to_message_id: number | null;
  reply_to: ReplyInfo | null;
}

interface Friend {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const utc = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const d = new Date(utc);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return hm;
  if (isYesterday) return `Вчера ${hm}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + hm;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function MessageAttachment({ msg, onLoad }: { msg: Message; onLoad?: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null);

  // Cached images may skip the React onLoad event entirely — check .complete
  // on mount and fire the handler manually if so.
  useEffect(() => {
    if (imgRef.current?.complete && onLoad) onLoad();
    // intentionally not depending on onLoad to avoid re-runs from new refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!msg.attachment_filename) return null;
  const url = `/uploads/chat/${msg.attachment_filename}`;
  const isImage = (msg.attachment_mime || '').startsWith('image/');

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="chat-msg__image" onClick={e => e.stopPropagation()}>
        <img
          ref={imgRef}
          src={url}
          alt={msg.attachment_original || 'image'}
          onLoad={onLoad}
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      download={msg.attachment_original ?? undefined}
      className="chat-msg__file"
      onClick={e => e.stopPropagation()}
    >
      <span className="chat-msg__file-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </span>
      <span className="chat-msg__file-info">
        <span className="chat-msg__file-name">{msg.attachment_original}</span>
        <span className="chat-msg__file-size">{formatFileSize(msg.attachment_size || 0)}</span>
      </span>
      <span className="chat-msg__file-download">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </span>
    </a>
  );
}

function formatDateSeparator(dateStr: string): string {
  const utc = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const d = new Date(utc);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function convName(conv: Conversation): string {
  if (conv.type === 'direct') return conv.other_user?.display_name || conv.other_user?.username || '—';
  return conv.group?.name || 'Группа';
}

function convAvatar(conv: Conversation) {
  if (conv.type === 'direct') {
    return { src: conv.other_user?.avatar_url ?? null, name: convName(conv) };
  }
  return { src: null, name: convName(conv) };
}

// ── NewChatModal ─────────────────────────────────────────────────────────────

interface SearchedUser {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  can_message: boolean;
}

function NewChatModal({
  onClose,
  onSelect,
  onError
}: {
  onClose: () => void;
  onSelect: (userId: number) => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      apiClient.get(`/api/users/search?q=${encodeURIComponent(query.trim())}`)
        .then(r => setResults(r.data))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function handlePick(u: SearchedUser) {
    if (!u.can_message) {
      onError('Этот пользователь принимает сообщения только от друзей');
      return;
    }
    onSelect(u.id);
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal__header">
          <h2 className="modal__title">Новый чат</h2>
          <button className="modal__close" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal__body">
          <div className="form-group">
            <label className="form-label">Найти пользователя</label>
            <input
              className="form-input"
              placeholder="Имя или username (минимум 2 символа)"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {query.trim().length < 2 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                Введите имя или username для поиска
              </div>
            ) : searching ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-md)' }}>
                <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
              </div>
            ) : results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                Ничего не найдено
              </div>
            ) : (
              results.map(u => (
                <button
                  key={u.id}
                  className={`chat-friend-row ${!u.can_message ? 'chat-friend-row--disabled' : ''}`}
                  onClick={() => handlePick(u)}
                  title={!u.can_message ? 'Пользователь принимает сообщения только от друзей' : undefined}
                >
                  <Avatar src={u.avatar_url} name={u.display_name || u.username} size={36} userId={u.id} showStatus />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                      {u.display_name || u.username}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                      @{u.username}
                    </div>
                  </div>
                  {!u.can_message && (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                      🔒 только друзья
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<number, string>>(new Map());
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialScrollDoneForConv = useRef<number | null>(null);
  const initialUnreadRef = useRef(0);
  const conversationsRef = useRef<Conversation[]>([]);
  const typingTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);
  const prevConvId = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [flashMsgId, setFlashMsgId] = useState<number | null>(null);

  // ── Load conversations ──

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/messages/conversations');
      setConversations(res.data);
    } catch {
      // ignore
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Keep a ref to the latest conversations so scroll-positioning logic
  // can read it without recreating callbacks every change
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // Handle ?conv= query param (e.g. from GroupPage)
  useEffect(() => {
    const convParam = searchParams.get('conv');
    if (convParam) {
      const id = parseInt(convParam);
      if (!isNaN(id)) {
        setActiveConvId(id);
        setMobileShowChat(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, setSearchParams]);

  // ── Load messages ──

  const loadMessages = useCallback(async (convId: number) => {
    // Capture unread BEFORE clearing/marking-read so initial scroll lands on
    // the first unread message instead of the very bottom.
    const conv = conversationsRef.current.find(c => c.id === convId);
    initialUnreadRef.current = conv?.unread_count ?? 0;
    initialScrollDoneForConv.current = null;
    isAtBottomRef.current = true;

    setLoadingMsgs(true);
    setMessages([]);
    try {
      const res = await apiClient.get(`/api/messages/conversations/${convId}/messages`);
      setMessages(res.data);
    } catch {
      // ignore
    } finally {
      setLoadingMsgs(false);
    }
    // Mark as read
    apiClient.patch(`/api/messages/conversations/${convId}/read`).catch(() => {});
    // Update unread in sidebar
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
  }, []);

  // ── Scroll helpers ──

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const c = messagesContainerRef.current;
    if (!c) return;
    if (behavior === 'smooth') {
      c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    } else {
      c.scrollTop = c.scrollHeight;
    }
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const c = messagesContainerRef.current;
    if (!c) return;
    isAtBottomRef.current = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
  }, []);

  // Called by image attachments when they finish loading — re-anchor to bottom
  // so that delayed image heights don't leave the chat half-scrolled.
  const handleAttachmentLoaded = useCallback(() => {
    if (isAtBottomRef.current) scrollToBottom('auto');
  }, [scrollToBottom]);

  useEffect(() => {
    if (!activeConvId) return;
    loadMessages(activeConvId);
    inputRef.current?.focus();
  }, [activeConvId, loadMessages]);

  // ── Scroll positioning ──
  //
  // First render for a conversation:
  //   • if there were unread messages — jump (no animation) to the first one
  //   • otherwise — jump to the bottom
  // Subsequent renders (new message arrived / sent):
  //   • smooth scroll to bottom only if user was near bottom OR sent it themself
  //   • otherwise leave their reading position alone
  //
  // Uses useLayoutEffect to position BEFORE paint, then re-runs on the next
  // animation frame (handles late image reflow that has not produced its
  // final height yet — esp. images that were cached and never fire onLoad).
  useLayoutEffect(() => {
    if (loadingMsgs || messages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    const isInitial = initialScrollDoneForConv.current !== activeConvId;

    const placeInitial = () => {
      const unread = initialUnreadRef.current;
      if (unread > 0 && unread <= messages.length) {
        const target = messages[messages.length - unread];
        const el = target ? document.getElementById(`msg-${target.id}`) : null;
        if (el) {
          el.scrollIntoView({ behavior: 'auto', block: 'start' });
          return;
        }
      }
      container.scrollTop = container.scrollHeight;
    };

    if (isInitial) {
      initialScrollDoneForConv.current = activeConvId ?? null;
      placeInitial();
      // Catch late layout reflow (cached images sometimes settle one frame later)
      const raf1 = requestAnimationFrame(() => {
        placeInitial();
        isAtBottomRef.current = true;
      });
      const raf2 = requestAnimationFrame(() => requestAnimationFrame(placeInitial));
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    // Subsequent updates
    const last = messages[messages.length - 1];
    if (isAtBottomRef.current || last?.user_id === user?.id) {
      scrollToBottom('smooth');
      isAtBottomRef.current = true;
    }
  }, [messages, loadingMsgs, activeConvId, user?.id, scrollToBottom]);

  // ── Socket events ──

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: Message) => {
      if (msg.conversation_id === activeConvId) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        // Mark as read since we're viewing this conversation
        apiClient.patch(`/api/messages/conversations/${msg.conversation_id}/read`).catch(() => {});
      }
      // Update conversation list (move to top, update last_message)
      setConversations(prev => {
        const existing = prev.find(c => c.id === msg.conversation_id);
        if (!existing) {
          loadConversations();
          return prev;
        }
        const updated: Conversation = {
          ...existing,
          last_message: {
            id: msg.id,
            content: msg.content,
            created_at: msg.created_at,
            display_name: msg.display_name,
            username: msg.username
          },
          unread_count: msg.conversation_id === activeConvId
            ? 0
            : existing.unread_count + (msg.user_id !== user?.id ? 1 : 0)
        };
        return [updated, ...prev.filter(c => c.id !== msg.conversation_id)];
      });
    };

    const handleMessageDeleted = ({ messageId }: { messageId: number; conversationId: number }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, is_deleted: 1, content: 'Сообщение удалено' } : m
      ));
    };

    const handleUserTyping = ({ userId, username, conversationId }: { userId: number; username: string; conversationId: number }) => {
      if (conversationId !== activeConvId) return;
      setTypingUsers(prev => new Map(prev).set(userId, username));
      clearTimeout(typingTimers.current[userId]);
      typingTimers.current[userId] = setTimeout(() => {
        setTypingUsers(prev => { const m = new Map(prev); m.delete(userId); return m; });
      }, 3000);
    };

    const handleUserStopTyping = ({ userId, conversationId }: { userId: number; conversationId: number }) => {
      if (conversationId !== activeConvId) return;
      setTypingUsers(prev => { const m = new Map(prev); m.delete(userId); return m; });
    };

    const handleConversationRead = ({ conversationId, userId: readerId, lastReadId }: {
      conversationId: number; userId: number; lastReadId: number;
    }) => {
      if (readerId === user?.id) return;
      setConversations(prev => prev.map(c =>
        c.id === conversationId
          ? { ...c, other_last_read_id: Math.max(c.other_last_read_id || 0, lastReadId) }
          : c
      ));
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stop_typing', handleUserStopTyping);
    socket.on('conversation_read', handleConversationRead);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stop_typing', handleUserStopTyping);
      socket.off('conversation_read', handleConversationRead);
    };
  }, [socket, activeConvId, user?.id, loadConversations]);

  // Join/leave socket rooms when switching conversations
  useEffect(() => {
    if (!socket) return;
    if (prevConvId.current !== null) {
      socket.emit('leave_conversation', prevConvId.current);
    }
    if (activeConvId !== null) {
      socket.emit('join_conversation', activeConvId);
    }
    prevConvId.current = activeConvId;
    setTypingUsers(new Map());
  }, [socket, activeConvId]);

  // ── Send message ──

  const sendMessage = useCallback(async () => {
    if (!activeConvId || sending) return;
    const content = inputValue.trim();
    if (!content && !pendingFile) return;

    setInputValue('');
    const fileToSend = pendingFile;
    setPendingFile(null);
    const replyId = replyTo?.id ?? null;
    setReplyTo(null);
    setSending(true);
    isTyping.current = false;

    try {
      let sent: Message;
      if (fileToSend) {
        const form = new FormData();
        form.append('file', fileToSend);
        if (content) form.append('content', content);
        if (replyId) form.append('reply_to', String(replyId));
        const res = await apiClient.post(
          `/api/messages/conversations/${activeConvId}/upload`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        sent = res.data;
      } else {
        const res = await apiClient.post(`/api/messages/conversations/${activeConvId}/send`, {
          content,
          reply_to: replyId
        });
        sent = res.data;
      }

      // Optimistic local update — don't wait for socket echo
      setMessages(prev => prev.some(m => m.id === sent.id) ? prev : [...prev, sent]);
      setConversations(prev => {
        const existing = prev.find(c => c.id === sent.conversation_id);
        if (!existing) return prev;
        return [
          {
            ...existing,
            last_message: {
              id: sent.id,
              content: sent.attachment_filename ? `📎 ${sent.attachment_original}` : sent.content,
              created_at: sent.created_at,
              display_name: sent.display_name,
              username: sent.username
            }
          },
          ...prev.filter(c => c.id !== sent.conversation_id)
        ];
      });
    } catch {
      setInputValue(content);
      setPendingFile(fileToSend);
      if (replyId) {
        // restore replyTo from the message we just had
        const restored = messages.find(m => m.id === replyId);
        if (restored) setReplyTo(restored);
      }
    } finally {
      setSending(false);
    }
  }, [inputValue, activeConvId, sending, pendingFile, replyTo, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Paste images from clipboard
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        if (file.size > 25 * 1024 * 1024) {
          toast.show('Картинка слишком большая (макс 25 МБ)', 'error');
          return;
        }
        e.preventDefault();
        const ext = item.type.split('/')[1] || 'png';
        const renamed = new File([file], `pasted-${Date.now()}.${ext}`, { type: item.type });
        setPendingFile(renamed);
        return;
      }
    }
  };

  // Scroll to a message and flash it briefly
  const scrollToMessage = useCallback((messageId: number) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashMsgId(messageId);
    setTimeout(() => setFlashMsgId(prev => prev === messageId ? null : prev), 1600);
  }, []);

  // Start replying to a message
  const startReply = useCallback((msg: Message) => {
    setReplyTo(msg);
    inputRef.current?.focus();
  }, []);

  // Toggle mute for the active conversation
  const toggleMute = useCallback(async () => {
    if (!activeConvId) return;
    const cur = conversations.find(c => c.id === activeConvId);
    if (!cur) return;
    const next = !cur.is_muted;
    setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, is_muted: next } : c));
    try {
      await apiClient.patch(`/api/messages/conversations/${activeConvId}/mute`, { muted: next });
      toast.show(next ? 'Чат отключён' : 'Уведомления чата включены', next ? 'info' : 'success');
    } catch {
      // revert
      setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, is_muted: !next } : c));
      toast.show('Не удалось изменить настройку', 'error');
    }
  }, [activeConvId, conversations, toast]);

  // ── Typing indicator ──

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    if (!socket || !activeConvId) return;
    if (!isTyping.current) {
      isTyping.current = true;
      socket.emit('typing', { conversationId: activeConvId });
    }
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      isTyping.current = false;
      socket.emit('stop_typing', { conversationId: activeConvId });
    }, 2000);
  };

  // ── Delete message ──

  const deleteMessage = useCallback(async (msgId: number) => {
    try {
      await apiClient.delete(`/api/messages/${msgId}`);
    } catch {
      // ignore
    }
  }, []);

  // ── Start direct chat ──

  const openDirectChat = useCallback(async (userId: number) => {
    try {
      const res = await apiClient.post(`/api/messages/direct/${userId}`);
      const conv: Conversation = res.data;
      setShowNewChat(false);
      setConversations(prev => {
        const exists = prev.find(c => c.id === conv.id);
        if (exists) return prev;
        return [conv, ...prev];
      });
      setActiveConvId(conv.id);
      setMobileShowChat(true);
    } catch (err: any) {
      toast.show(err.response?.data?.error || 'Не удалось открыть чат', 'error');
    }
  }, [toast]);

  // ── Select conversation ──

  const selectConversation = (conv: Conversation) => {
    setActiveConvId(conv.id);
    setMobileShowChat(true);
  };

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;

  // ── Message grouping (by date) ──

  const renderMessages = () => {
    const result: React.ReactNode[] = [];
    let lastDate = '';
    let lastUserId: number | null = null;

    messages.forEach((msg, i) => {
      const utc = msg.created_at.includes('Z') || msg.created_at.includes('+')
        ? msg.created_at : msg.created_at.replace(' ', 'T') + 'Z';
      const msgDate = new Date(utc).toDateString();
      if (msgDate !== lastDate) {
        lastDate = msgDate;
        result.push(
          <div key={`sep-${i}`} className="chat-date-sep">
            <span>{formatDateSeparator(msg.created_at)}</span>
          </div>
        );
        lastUserId = null;
      }

      const isOwn = msg.user_id === user?.id;
      const showAvatar = !isOwn && lastUserId !== msg.user_id;
      lastUserId = msg.user_id;

      result.push(
        <div
          key={msg.id}
          id={`msg-${msg.id}`}
          className={`chat-msg ${isOwn ? 'chat-msg--own' : 'chat-msg--other'} ${flashMsgId === msg.id ? 'chat-msg--flash' : ''}`}
        >
          {!isOwn && (
            <div className="chat-msg__avatar">
              {showAvatar
                ? <Avatar src={msg.avatar_url} name={msg.display_name || msg.username} size={32} />
                : <div style={{ width: 32 }} />
              }
            </div>
          )}
          <div className="chat-msg__body">
            {!isOwn && showAvatar && (
              <div className="chat-msg__name">{msg.display_name || msg.username}</div>
            )}
            <div className={`chat-msg__bubble ${msg.is_deleted ? 'chat-msg__bubble--deleted' : ''}`}>
              {!msg.is_deleted && msg.reply_to && (
                <div
                  className="chat-msg__quote"
                  onClick={(e) => {
                    e.stopPropagation();
                    scrollToMessage(msg.reply_to!.id);
                  }}
                >
                  <span className="chat-msg__quote-author">
                    {msg.reply_to.display_name || msg.reply_to.username}
                  </span>
                  <span className="chat-msg__quote-text">
                    {msg.reply_to.is_deleted
                      ? 'Сообщение удалено'
                      : msg.reply_to.attachment_original
                        ? `📎 ${msg.reply_to.attachment_original}`
                        : msg.reply_to.content}
                  </span>
                </div>
              )}
              {!msg.is_deleted && msg.attachment_filename && (
                <MessageAttachment msg={msg} onLoad={handleAttachmentLoaded} />
              )}
              {msg.content && <span className="chat-msg__text">{msg.content}</span>}
              <span className="chat-msg__time">
                {formatTime(msg.created_at)}
                {isOwn && !msg.is_deleted && activeConv?.type === 'direct' && (
                  <span
                    className={`chat-msg__receipt ${msg.id <= (activeConv.other_last_read_id || 0) ? 'chat-msg__receipt--read' : ''}`}
                    title={msg.id <= (activeConv.other_last_read_id || 0) ? 'Прочитано' : 'Доставлено'}
                  >
                    {msg.id <= (activeConv.other_last_read_id || 0) ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 6 7 17 2 12"/>
                        <polyline points="22 10 13 19 11.5 17.5"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </span>
                )}
              </span>
              {!msg.is_deleted && (
                <div className="chat-msg__actions">
                  <button
                    className="chat-msg__action"
                    onClick={(e) => { e.stopPropagation(); startReply(msg); }}
                    title="Ответить"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 17 4 12 9 7"/>
                      <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                    </svg>
                  </button>
                  {isOwn && (
                    <button
                      className="chat-msg__action chat-msg__action--danger"
                      onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }}
                      title="Удалить"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    });

    return result;
  };

  const typingList = [...typingUsers.values()];

  // ── Render ──

  return (
    <div className="page-content">
      <div className="chat-layout">
        {/* Sidebar */}
        <aside className={`chat-sidebar ${mobileShowChat ? 'chat-sidebar--hidden-mobile' : ''}`}>
          <div className="chat-sidebar__header">
            <span className="chat-sidebar__title">Сообщения</span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewChat(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Новый чат
            </button>
          </div>

          <div className="chat-sidebar__list">
            {loadingConvs ? (
              <>
                {[1, 2, 3, 4].map(i => <SkeletonConversationRow key={i} />)}
              </>
            ) : conversations.length === 0 ? (
              <EmptyState
                kind="chats"
                title="Пока нет чатов"
                description="Нажмите «Новый чат», чтобы начать переписку"
              />
            ) : (
              conversations.map(conv => {
                const av = convAvatar(conv);
                const isActive = conv.id === activeConvId;
                return (
                  <button
                    key={conv.id}
                    className={`chat-conv-row ${isActive ? 'chat-conv-row--active' : ''}`}
                    onClick={() => selectConversation(conv)}
                  >
                    <div className="chat-conv-row__avatar">
                      <Avatar
                        src={av.src}
                        name={av.name}
                        size={44}
                        userId={conv.type === 'direct' ? conv.other_user?.id : undefined}
                        showStatus={conv.type === 'direct'}
                      />
                      {conv.type === 'group' && (
                        <span className="chat-conv-row__type-badge">G</span>
                      )}
                    </div>
                    <div className="chat-conv-row__info">
                      <div className="chat-conv-row__top">
                        <span className="chat-conv-row__name">
                          {convName(conv)}
                          {conv.is_muted && (
                            <span className="chat-conv-row__mute" title="Без уведомлений">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                                <path d="M18.63 13A17.89 17.89 0 0 1 18 8"/>
                                <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/>
                                <path d="M18 8a6 6 0 0 0-9.33-5"/>
                                <line x1="1" y1="1" x2="23" y2="23"/>
                              </svg>
                            </span>
                          )}
                        </span>
                        {conv.last_message && (
                          <span className="chat-conv-row__time">
                            {formatTime(conv.last_message.created_at)}
                          </span>
                        )}
                      </div>
                      <div className="chat-conv-row__bottom">
                        <span className="chat-conv-row__preview">
                          {conv.last_message
                            ? `${conv.last_message.display_name || conv.last_message.username}: ${conv.last_message.content}`
                            : <em>Нет сообщений</em>
                          }
                        </span>
                        {conv.unread_count > 0 && (
                          <span className="chat-conv-row__unread">{conv.unread_count}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat window */}
        <main className={`chat-window ${!mobileShowChat ? 'chat-window--hidden-mobile' : ''}`}>
          {activeConv ? (
            <>
              <div className="chat-window__header">
                <button
                  className="chat-back-btn"
                  onClick={() => setMobileShowChat(false)}
                  title="Назад"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
                <Avatar
                  src={convAvatar(activeConv).src}
                  name={convName(activeConv)}
                  size={38}
                  userId={activeConv.type === 'direct' ? activeConv.other_user?.id : undefined}
                  showStatus={activeConv.type === 'direct'}
                />
                <div className="chat-window__header-info">
                  <div className="chat-window__header-name">
                    {convName(activeConv)}
                    {activeConv.is_muted && (
                      <span className="chat-window__muted-icon" title="Уведомления отключены">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                          <path d="M18.63 13A17.89 17.89 0 0 1 18 8"/>
                          <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/>
                          <path d="M18 8a6 6 0 0 0-9.33-5"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      </span>
                    )}
                  </div>
                  <div className="chat-window__header-sub">
                    {activeConv.type === 'group'
                      ? `${activeConv.member_count ?? 0} участников`
                      : `@${activeConv.other_user?.username}`
                    }
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon chat-window__action"
                  onClick={toggleMute}
                  title={activeConv.is_muted ? 'Включить уведомления' : 'Отключить уведомления'}
                  aria-label="Mute"
                >
                  {activeConv.is_muted ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      <path d="M18.63 13A17.89 17.89 0 0 1 18 8"/>
                      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/>
                      <path d="M18 8a6 6 0 0 0-9.33-5"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                  )}
                </button>
              </div>

              <div
                className="chat-messages"
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
              >
                {loadingMsgs ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SkeletonMessage />
                    <SkeletonMessage own />
                    <SkeletonMessage />
                    <SkeletonMessage own />
                  </div>
                ) : messages.length === 0 ? (
                  <EmptyState
                    kind="messages"
                    title="Нет сообщений"
                    description="Напишите первым, чтобы начать диалог"
                  />
                ) : (
                  renderMessages()
                )}
                {typingList.length > 0 && (
                  <div className="chat-typing">
                    <span>{typingList.join(', ')} {typingList.length === 1 ? 'печатает' : 'печатают'}...</span>
                  </div>
                )}
              </div>

              <div className="chat-input-wrap">
                {replyTo && (
                  <div className="chat-reply-bar">
                    <span className="chat-reply-bar__icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 17 4 12 9 7"/>
                        <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                      </svg>
                    </span>
                    <div className="chat-reply-bar__body">
                      <div className="chat-reply-bar__title">
                        Ответ {replyTo.user_id === user?.id
                          ? 'себе'
                          : replyTo.display_name || replyTo.username}
                      </div>
                      <div className="chat-reply-bar__preview">
                        {replyTo.attachment_original
                          ? `📎 ${replyTo.attachment_original}`
                          : replyTo.content}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="chat-reply-bar__close"
                      onClick={() => setReplyTo(null)}
                      title="Отменить ответ"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                )}
                {pendingFile && (
                  <div className="chat-pending-file">
                    <span className="chat-pending-file__icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                      </svg>
                    </span>
                    <span className="chat-pending-file__name">{pendingFile.name}</span>
                    <span className="chat-pending-file__size">{formatFileSize(pendingFile.size)}</span>
                    <button
                      className="chat-pending-file__remove"
                      type="button"
                      onClick={() => setPendingFile(null)}
                      title="Убрать файл"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                )}

                <div className="chat-input-area">
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 25 * 1024 * 1024) {
                        alert('Размер файла не должен превышать 25 МБ');
                      } else {
                        setPendingFile(f);
                      }
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost chat-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Прикрепить файл"
                    disabled={sending}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                  </button>
                  <textarea
                    ref={inputRef}
                    className="chat-input"
                    placeholder={pendingFile ? 'Подпись к файлу (необязательно)' : 'Написать сообщение... (Enter — отправить, Shift+Enter — новая строка, Ctrl+V — вставить картинку)'}
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    rows={1}
                  />
                  <button
                    className="btn btn-primary chat-send-btn"
                    onClick={sendMessage}
                    disabled={(!inputValue.trim() && !pendingFile) || sending}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="chat-empty-state">
              <div style={{ fontSize: 56, marginBottom: 'var(--space-md)' }}>💬</div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Выберите чат
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>
                или начните новую переписку
              </div>
            </div>
          )}
        </main>
      </div>

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onSelect={openDirectChat}
          onError={(msg) => toast.show(msg, 'error')}
        />
      )}
    </div>
  );
}
