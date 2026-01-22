import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { AccountSwitcher } from '../Accounts/AccountSwitcher';
import { AccountSettings } from '../Settings/AccountSettings';
import { MessageList } from '../Messages/MessageList';
import { useAccountsStore } from '../../store/accountsStore';
import { useChatsStore } from '../../store/chatsStore';
import { Chat } from '../../types/telegram';
import './MainLayout.css';

export const MainLayout = () => {
  const { getActiveAccount } = useAccountsStore();
  const { getChats: getCachedChats, setChats: setCachedChats } = useChatsStore();
  const activeAccount = getActiveAccount();

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


  useEffect(() => {
    if (!activeAccount) {
      setError('Нет активного аккаунта');
      return;
    }

    // Подписываемся на события загрузки чатов
    let unlistenChatLoaded: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;

    const setupListeners = async () => {
      // 1. Загружаем чаты из базы данных СРАЗУ
      try {
        console.log('[MainLayout] Loading chats from database...');
        const cachedChats = await invoke<Chat[]>('get_cached_chats', { accountId: activeAccount.id });

        if (cachedChats && cachedChats.length > 0) {
          console.log('[MainLayout] ✓ Loaded', cachedChats.length, 'chats from database');
          setChats(cachedChats);
          setLoading(false); // Убираем loader сразу!
        } else {
          console.log('[MainLayout] No cached chats in database');
          setLoading(true);
        }
      } catch (err) {
        console.error('[MainLayout] Failed to load cached chats:', err);
        setLoading(true);
      }

      // 2. Запускаем фоновую синхронизацию с Telegram
      const loadedChats: Chat[] = [];
      const chatIds = new Set<number>(); // Для дедупликации

      // Слушаем события загрузки отдельных чатов
      unlistenChatLoaded = await listen<Chat>('chat-loaded', (event) => {
        console.log('[MainLayout] Chat loaded event:', event.payload);

        // Проверяем дубликаты
        if (chatIds.has(event.payload.id)) {
          console.warn('[MainLayout] Duplicate chat ID:', event.payload.id);
          return;
        }

        chatIds.add(event.payload.id);
        loadedChats.push(event.payload);

        // ОБНОВЛЯЕМ СРАЗУ! Каждый чат отображается мгновенно
        setChats([...loadedChats]);
        setLoading(false);
      });

      // Слушаем событие завершения загрузки
      unlistenComplete = await listen<number>('chats-loading-complete', (event) => {
        console.log('[MainLayout] Loading complete, total chats:', event.payload);

        // Сохраняем в localStorage для обратной совместимости
        setCachedChats(activeAccount.id, loadedChats);
        setLoading(false);
        setError('');
      });

      // Запускаем загрузку чатов из Telegram
      try {
        console.log('[MainLayout] Starting background chat sync from Telegram...');
        await invoke('start_loading_chats', { accountId: activeAccount.id });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Ошибка загрузки чатов';
        console.error('[MainLayout] Failed to start loading:', err);
        setError(errorMsg);
        setLoading(false);
      }
    };

    setupListeners();

    // Cleanup
    return () => {
      if (unlistenChatLoaded) unlistenChatLoaded();
      if (unlistenComplete) unlistenComplete();
    };
  }, [activeAccount?.id]);

  const handleChatClick = (chatId: number) => {
    setSelectedChatId(chatId);
    console.log('[MainLayout] Selected chat:', chatId);
  };

  // Добавить/убрать из избранного
  const toggleFavorite = (chatId: number) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(chatId)) {
        newFavorites.delete(chatId);
      } else {
        newFavorites.add(chatId);
      }
      localStorage.setItem('favorites', JSON.stringify([...newFavorites]));
      return newFavorites;
    });
    setContextMenu(null);
  };

  // Закрыть контекстное меню при клике вне
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Фильтрация чатов
  const filteredChats = chats.filter(chat => {
    // Поиск
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const titleMatch = chat.title.toLowerCase().includes(query);
      const usernameMatch = chat.username?.toLowerCase().includes(query);
      if (!titleMatch && !usernameMatch) return false;
    }

    // Фильтр по типу
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

  // Обработчик правого клика
  const handleContextMenu = (e: React.MouseEvent, chatId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, chatId });
  };

  const selectedChat = chats.find(chat => chat.id === selectedChatId);

  return (
    <div className="main-layout">
      {/* Sidebar со списком чатов */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            <div className="header-left">
              <AccountSwitcher />
              <h2 className="sidebar-title">Chats</h2>
            </div>
            <div className="sidebar-actions">
              <button className="icon-button" title="Compose" onClick={() => setShowSettings(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="search-container">
            <input
              type="text"
              className="search-input"
              placeholder="Search (⌘K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="chat-filters">
            <button
              className={`filter-button ${activeFilter === 'contacts' ? 'active' : ''}`}
              onClick={() => setActiveFilter('contacts')}
            >
              Контакты
            </button>
            <button
              className={`filter-button ${activeFilter === 'chats' ? 'active' : ''}`}
              onClick={() => setActiveFilter('chats')}
            >
              Чаты
            </button>
            <button
              className={`filter-button ${activeFilter === 'favorites' ? 'active' : ''}`}
              onClick={() => setActiveFilter('favorites')}
            >
              Избранное
            </button>
          </div>
        </div>

        <div className="chat-list">
          {loading ? (
            <div className="empty-state">
              <p>Загрузка...</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <p style={{ color: 'var(--error-color)' }}>{error}</p>
            </div>
          ) : filteredChats.length > 0 ? (
            filteredChats.map((chat, index) => (
              <div
                key={chat.id}
                className={`chat-item ${selectedChatId === chat.id ? 'selected' : ''} ${favorites.has(chat.id) ? 'favorite' : ''}`}
                onClick={() => handleChatClick(chat.id)}
                onContextMenu={(e) => handleContextMenu(e, chat.id)}
              >
                <div className="chat-avatar">
                  {chat.avatarPath ? (
                    <img
                      src={convertFileSrc(chat.avatarPath)}
                      alt={chat.title}
                      className="avatar-image"
                    />
                  ) : (
                    <span className="avatar-placeholder">{chat.title.substring(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className="chat-info">
                  <div className="chat-info-top">
                    <div className="chat-title-row">
                      <div className="chat-title">{chat.title}</div>
                      {index === 1 && <span className="pinned-icon">📌</span>}
                    </div>
                    <div className="chat-meta-right">
                      {index === 0 && <span className="status-ticks">✓✓</span>}
                      <div className="chat-time">19:59</div>
                    </div>
                  </div>
                  <div className="chat-info-bottom">
                    <div className="chat-preview">
                      {index === 0 && <span className="preview-sender">You: </span>}
                      {chat.lastMessage || 'Нет сообщений'}
                    </div>
                    {chat.unreadCount > 0 && (
                      <div className="unread-count">{chat.unreadCount}</div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : searchQuery.trim() ? (
            <div className="empty-state">
              <p>Ничего не найдено</p>
            </div>
          ) : (
            <div className="empty-state" style={{ marginTop: '20px' }}>
              <p>Чаты появятся здесь <br /> после синхронизации</p>
            </div>
          )}
        </div>
      </aside>

      {/* Основная область с сообщениями */}
      <main className="content">
        <div className="content-bg"></div>

        {selectedChat ? (
          <header className="content-header">
            <div className="content-header-info">
              <h3>{selectedChat.title}</h3>
              <span className="status">в сети</span>
            </div>
            <div className="content-header-actions">
              <button className="icon-button" title="Search messages">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </button>
              <button className="icon-button" title="More options">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none"></circle>
                  <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"></circle>
                  <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none"></circle>
                </svg>
              </button>
            </div>
          </header>
        ) : (
          <div style={{ height: '56px' }}></div>
        )}

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

      {/* Модальное окно настроек */}
      {showSettings && <AccountSettings onClose={() => setShowSettings(false)} />}

      {/* Контекстное меню */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="context-menu-item"
            onClick={() => toggleFavorite(contextMenu.chatId)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={favorites.has(contextMenu.chatId) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            {favorites.has(contextMenu.chatId) ? 'Remove from Favorites' : 'Add to Favorites'}
          </button>
        </div>
      )}
    </div>
  );
};
