import { useCallback, useEffect, useRef, useState } from 'react';
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

function MessageAttachment({ msg }: { msg: Message }) {
  if (!msg.attachment_filename) return null;
  const url = `/uploads/chat/${msg.attachment_filename}`;
  const isImage = (msg.attachment_mime || '').startsWith('image/');

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="chat-msg__image" onClick={e => e.stopPropagation()}>
        <img src={url} alt={msg.attachment_original || 'image'} loading="lazy" />
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);
  const prevConvId = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);

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

  useEffect(() => {
    if (!activeConvId) return;
    loadMessages(activeConvId);
    inputRef.current?.focus();
  }, [activeConvId, loadMessages]);

  // ── Scroll to bottom ──

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

    socket.on('new_message', handleNewMessage);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stop_typing', handleUserStopTyping);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stop_typing', handleUserStopTyping);
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
    setSending(true);
    isTyping.current = false;

    try {
      let sent: Message;
      if (fileToSend) {
        const form = new FormData();
        form.append('file', fileToSend);
        if (content) form.append('content', content);
        const res = await apiClient.post(
          `/api/messages/conversations/${activeConvId}/upload`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        sent = res.data;
      } else {
        const res = await apiClient.post(`/api/messages/conversations/${activeConvId}/send`, { content });
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
    } finally {
      setSending(false);
    }
  }, [inputValue, activeConvId, sending, pendingFile]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

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
          className={`chat-msg ${isOwn ? 'chat-msg--own' : 'chat-msg--other'}`}
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
              {!msg.is_deleted && msg.attachment_filename && (
                <MessageAttachment msg={msg} />
              )}
              {msg.content && <span className="chat-msg__text">{msg.content}</span>}
              <span className="chat-msg__time">{formatTime(msg.created_at)}</span>
              {!msg.is_deleted && isOwn && (
                <button
                  className="chat-msg__del"
                  onClick={() => deleteMessage(msg.id)}
                  title="Удалить"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
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
                        <span className="chat-conv-row__name">{convName(conv)}</span>
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
                  <div className="chat-window__header-name">{convName(activeConv)}</div>
                  <div className="chat-window__header-sub">
                    {activeConv.type === 'group'
                      ? `${activeConv.member_count ?? 0} участников`
                      : `@${activeConv.other_user?.username}`
                    }
                  </div>
                </div>
              </div>

              <div className="chat-messages">
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
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-wrap">
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
                    placeholder={pendingFile ? 'Подпись к файлу (необязательно)' : 'Написать сообщение... (Enter — отправить, Shift+Enter — новая строка)'}
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
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
