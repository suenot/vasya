import { useEffect, useState, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AccountSettings } from '../Settings/AccountSettings';
import { MessageList } from '../Messages/MessageList';
import { ChatList, ChatHeader, ChatContextMenu } from '../Chat';
import { useAccountsStore } from '../../store/accountsStore';
import { useChatsStore } from '../../store/chatsStore';
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

  const debouncedSearch = useDebounce(searchQuery, 200);

  // Mutable refs for streaming chat-loaded events without re-renders
  const [chatIdsSet] = useState(() => new Set<number>());
  const [loadedChatsArr] = useState<Chat[]>(() => []);

  useTauriEvent<Chat>('chat-loaded', useCallback((chat: Chat) => {
    if (chatIdsSet.has(chat.id)) return;
    chatIdsSet.add(chat.id);
    loadedChatsArr.push(chat);
    setChats([...loadedChatsArr]);
    setLoading(false);
  }, [chatIdsSet, loadedChatsArr]));

  useTauriEvent<number>('chats-loading-complete', useCallback((_total: number) => {
    if (activeAccount) {
      setCachedChats(activeAccount.id, loadedChatsArr);
    }
    setLoading(false);
    setError('');
  }, [activeAccount, setCachedChats, loadedChatsArr]));

  // Clear streaming state on account switch
  useEffect(() => {
    chatIdsSet.clear();
    loadedChatsArr.length = 0;
  }, [activeAccountId, chatIdsSet, loadedChatsArr]);

  // Load cached chats + start background sync
  useEffect(() => {
    if (!activeAccount) {
      setError('Нет активного аккаунта');
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки чатов');
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

  return (
    <div className="main-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            <div className="header-left">
              <img src="/vasyapp.svg" alt="" className="sidebar-logo" />
              <h2 className="sidebar-title">Vasyapp</h2>
            </div>
            <div className="sidebar-actions">
              <button className="icon-button" title="Settings" onClick={() => setShowSettings(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
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
            onSearchChange={setSearchQuery}
            onFilterChange={setActiveFilter}
            onChatClick={handleChatClick}
            onContextMenu={handleContextMenu}
          />
        </div>
      </aside>

      <main className="content">
        <div className="content-bg" />
        <ChatHeader chat={selectedChat} />

        <div className="messages-area">
          {selectedChat && activeAccount ? (
            <MessageList
              accountId={activeAccount.id}
              chatId={selectedChat.id}
              chatTitle={selectedChat.title}
            />
          ) : (
            <div className="empty-chat">
              <div className="empty-chat-bubble">
                Выберите чат, чтобы начать общение
              </div>
            </div>
          )}
        </div>
      </main>

      {showSettings && <AccountSettings onClose={() => setShowSettings(false)} />}

      {contextMenu && (
        <ChatContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          chatId={contextMenu.chatId}
          isFavorite={favorites.has(contextMenu.chatId)}
          onToggleFavorite={toggleFavorite}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
};
