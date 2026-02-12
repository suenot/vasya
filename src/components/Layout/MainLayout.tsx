import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AccountSettings } from '../Settings/AccountSettings';
import { AccountSwitcher } from '../Accounts/AccountSwitcher';
import { MessageList, MessageListHandle } from '../Messages/MessageList';
import { prioritizeChat } from '../../hooks/useMediaQueue';
import { ChatList, ChatHeader, ChatContextMenu, ChatInfoPanel } from '../Chat';
import { useAccountsStore } from '../../store/accountsStore';
import { useChatsStore } from '../../store/chatsStore';
import { useConnectionStore } from '../../store/connectionStore';
import { useDebounce } from '../../hooks/useDebounce';
import { useTauriEvent } from '../../hooks/useTauriEvent';
import { Chat } from '../../types/telegram';
import './MainLayout.css';

export const MainLayout = () => {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const accounts = useAccountsStore((s) => s.accounts);
  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId]
  );
  const getCachedChats = useChatsStore((s) => s.getChats);
  const setCachedChats = useChatsStore((s) => s.setChats);

  const [chats, setChats] = useState<Chat[]>(
    activeAccount ? getCachedChats(activeAccount.id) || [] : []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'contacts' | 'chats' | 'favorites'>('chats');
  const [favorites, setFavorites] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('favorites');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; chatId: number } | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const messageListRef = useRef<MessageListHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(searchQuery, 200);

  // Mutable refs for streaming chat-loaded events without re-renders
  const [chatIdsSet] = useState(() => new Set<number>());
  const [loadedChatsArr] = useState<Chat[]>(() => []);
  const flushRef = useRef(0);

  useTauriEvent<Chat>('chat-loaded', useCallback((chat: Chat) => {
    if (chatIdsSet.has(chat.id)) return;
    chatIdsSet.add(chat.id);
    loadedChatsArr.push(chat);

    // First chat arriving proves the connection is alive
    if (chatIdsSet.size === 1) {
      useConnectionStore.getState().setConnected();
    }

    // Batch: one React state update per animation frame instead of per event
    if (!flushRef.current) {
      flushRef.current = requestAnimationFrame(() => {
        flushRef.current = 0;
        setChats([...loadedChatsArr]);
        setLoading(false);
      });
    }
  }, [chatIdsSet, loadedChatsArr]));

  // Handle avatar updates from background downloads
  useTauriEvent<{ chatId: number; avatarPath: string }>('chat-avatar-updated', useCallback((evt) => {
    const idx = loadedChatsArr.findIndex((c) => c.id === evt.chatId);
    if (idx !== -1) {
      loadedChatsArr[idx] = { ...loadedChatsArr[idx], avatarPath: evt.avatarPath };
    }
    setChats((prev) => prev.map((c) =>
      c.id === evt.chatId ? { ...c, avatarPath: evt.avatarPath } : c
    ));
  }, [loadedChatsArr]));

  useTauriEvent<number>('chats-loading-complete', useCallback((_total: number) => {
    if (activeAccount) {
      setCachedChats(activeAccount.id, loadedChatsArr);
    }
    setLoading(false);
    setError('');
  }, [activeAccount, setCachedChats, loadedChatsArr]));

  // Listen for connection-status events from backend updates handler
  const setConnectionStatus = useConnectionStore((s) => s.setStatus);
  useTauriEvent<{ accountId: string; status: string }>('connection-status', useCallback((evt) => {
    if (evt.accountId === activeAccountId) {
      setConnectionStatus(evt.status as 'connecting' | 'connected' | 'reconnecting' | 'disconnected');
    }
  }, [activeAccountId, setConnectionStatus]));

  // Cancel pending flush on unmount
  useEffect(() => {
    return () => {
      if (flushRef.current) cancelAnimationFrame(flushRef.current);
    };
  }, []);

  // Clear streaming state on account switch
  useEffect(() => {
    if (flushRef.current) {
      cancelAnimationFrame(flushRef.current);
      flushRef.current = 0;
    }
    chatIdsSet.clear();
    loadedChatsArr.length = 0;
  }, [activeAccountId, chatIdsSet, loadedChatsArr]);

  // Load cached chats + start background sync
  useEffect(() => {
    if (!activeAccount) {
      setError('No active account');
      return;
    }

    const loadAndSync = async () => {
      try {
        const cached = await invoke<Chat[]>('get_cached_chats', { accountId: activeAccount.id });
        if (cached && cached.length > 0) {
          setChats(cached);
          setLoading(false);
        } else {
          setLoading(true);
        }
      } catch {
        setLoading(true);
      }

      try {
        await invoke('start_loading_chats', { accountId: activeAccount.id });
        // start_loading_chats returned successfully → connection is alive
        useConnectionStore.getState().setConnected();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || 'Failed to load chats');
        setLoading(false);
      }
    };

    loadAndSync();
  }, [activeAccountId]);

  // Filtered chats — memoized with debounced search
  const filteredChats = useMemo(() => {
    return chats.filter((chat) => {
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase();
        if (
          !chat.title.toLowerCase().includes(q) &&
          !chat.username?.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      switch (activeFilter) {
        case 'contacts':
          return chat.chatType === 'user';
        case 'chats':
          return chat.chatType === 'group' || chat.chatType === 'channel';
        case 'favorites':
          return favorites.has(chat.id);
        default:
          return true;
      }
    });
  }, [chats, debouncedSearch, activeFilter, favorites]);

  const handleChatClick = useCallback((chatId: number) => {
    setSelectedChatId(chatId);
    prioritizeChat(chatId);
  }, []);

  const toggleFavorite = useCallback((chatId: number) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      localStorage.setItem('favorites', JSON.stringify([...next]));
      return next;
    });
    setContextMenu(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, chatId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, chatId });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId]
  );

  const handleScrollToMessage = useCallback((messageId: number) => {
    setHighlightedMessageId(messageId);
    messageListRef.current?.scrollToMessage(messageId);
    // Clear highlight after animation
    setTimeout(() => setHighlightedMessageId(null), 2000);
  }, []);

  return (
    <div className="main-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            <AccountSwitcher />
            <div className="sidebar-actions">
              <div className={`search-container-inline ${isSearchExpanded || searchQuery ? 'expanded' : ''}`}>
                <button
                  className="icon-button search-toggle"
                  onClick={() => {
                    setIsSearchExpanded(!isSearchExpanded);
                    if (!isSearchExpanded) setTimeout(() => searchInputRef.current?.focus(), 100);
                  }}
                  title="Search"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </button>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="inline-search-input"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onBlur={() => { if (!searchQuery) setIsSearchExpanded(false); }}
                />
              </div>
              <button className="icon-button" title="Settings" onClick={() => setShowSettings(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>

          <ChatList
            chats={filteredChats}
            loading={loading}
            error={error}
            selectedChatId={selectedChatId}
            favorites={favorites}
            searchQuery={searchQuery}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onChatClick={handleChatClick}
            onContextMenu={handleContextMenu}
          />
        </div>
      </aside >

      <main className="content">
        <div className="content-bg" />
        <ChatHeader chat={selectedChat} accountId={activeAccount?.id} onScrollToMessage={handleScrollToMessage} onShowInfo={() => setShowChatInfo(true)} onDeleteChat={() => setSelectedChatId(null)} />

        <div className="messages-area">
          {selectedChat && activeAccount ? (
            <MessageList
              ref={messageListRef}
              accountId={activeAccount.id}
              chatId={selectedChat.id}
              chatTitle={selectedChat.title}
              highlightedMessageId={highlightedMessageId}
            />
          ) : (
            <div className="empty-chat">
              <div className="empty-chat-bubble">
                Select a chat to start messaging
              </div>
            </div>
          )}
        </div>

        {showChatInfo && selectedChat && (
          <ChatInfoPanel chat={selectedChat} onClose={() => setShowChatInfo(false)} />
        )}
      </main>

      {showSettings && <AccountSettings onClose={() => setShowSettings(false)} />}

      {
        contextMenu && (
          <ChatContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            chatId={contextMenu.chatId}
            isFavorite={favorites.has(contextMenu.chatId)}
            onToggleFavorite={toggleFavorite}
            onClose={closeContextMenu}
          />
        )
      }
    </div >
  );
};
