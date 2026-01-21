import { useEffect, useState } from 'react';
import { AccountSwitcher } from '../Accounts/AccountSwitcher';
import { MessageList } from '../Messages/MessageList';
import { useAccountsStore } from '../../store/accountsStore';
import { useChatsStore } from '../../store/chatsStore';
import { useTauriCommand } from '../../hooks/useTauriCommand';
import { Chat } from '../../types/telegram';
import './MainLayout.css';

export const MainLayout = () => {
  const { getActiveAccount } = useAccountsStore();
  const { getChats: getCachedChats, setChats: setCachedChats } = useChatsStore();
  const activeAccount = getActiveAccount();

  const [chats, setChats] = useState<Chat[]>(
    activeAccount ? getCachedChats(activeAccount.id) || [] : []
  );
  const [loading, setLoading] = useState(false); // Начинаем с false, так как показываем кэш сразу
  const [error, setError] = useState('');
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const getChatsCommand = useTauriCommand<Chat[], { accountId: string }>('get_chats');

  useEffect(() => {
    const loadChats = async () => {
      if (!activeAccount) {
        setError('Нет активного аккаунта');
        return;
      }

      // Проверяем кэш
      const cached = getCachedChats(activeAccount.id);

      if (cached && cached.length > 0) {
        // Если есть кэш - показываем его сразу
        console.log('[MainLayout] Showing cached chats:', cached.length);
        setChats(cached);
        setLoading(false);
      } else {
        // Если кэша нет - показываем индикатор загрузки
        setLoading(true);
      }

      // Загружаем свежие чаты в фоне (всегда)
      try {
        console.log('[MainLayout] Loading fresh chats for account:', activeAccount.id);
        const fetchedChats = await getChatsCommand({ accountId: activeAccount.id });
        console.log('[MainLayout] Chats loaded:', fetchedChats.length);

        // Обновляем и state и кэш
        setChats(fetchedChats);
        setCachedChats(activeAccount.id, fetchedChats);
        setError(''); // Очищаем ошибки при успешной загрузке
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Ошибка загрузки чатов';
        console.error('[MainLayout] Failed to load chats:', err);

        // Показываем ошибку только если нет кэша
        if (!cached || cached.length === 0) {
          setError(errorMsg);
        }
      } finally {
        setLoading(false);
      }
    };

    loadChats();
  }, [activeAccount?.id]);

  const handleChatClick = (chatId: number) => {
    setSelectedChatId(chatId);
    console.log('[MainLayout] Selected chat:', chatId);
  };

  const selectedChat = chats.find(chat => chat.id === selectedChatId);

  return (
    <div className="main-layout">
      {/* Sidebar со списком чатов */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Telegram</h2>
          <AccountSwitcher />
        </div>

        <div className="chat-filters">
          <button className="filter-button active">Все чаты</button>
          <button className="filter-button">Фокус</button>
        </div>

        <div className="chat-list">
          {loading ? (
            <div className="empty-state">
              <p>Загрузка чатов...</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <p style={{ color: '#e53935' }}>{error}</p>
            </div>
          ) : chats.length > 0 ? (
            chats.map(chat => (
              <div
                key={chat.id}
                className={`chat-item ${selectedChatId === chat.id ? 'selected' : ''}`}
                onClick={() => handleChatClick(chat.id)}
              >
                <div className="chat-avatar">
                  {chat.title.substring(0, 2).toUpperCase()}
                </div>
                <div className="chat-info">
                  <div className="chat-title">{chat.title}</div>
                  <div className="chat-preview">
                    {chat.lastMessage || 'Нет сообщений'}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>Чаты появятся здесь после синхронизации</p>
            </div>
          )}
        </div>
      </aside>

      {/* Основная область с сообщениями */}
      <main className="content">
        <div className="content-header">
          <h3>{selectedChat ? selectedChat.title : 'Выберите чат'}</h3>
        </div>

        <div className="messages-area">
          {selectedChat && activeAccount ? (
            <MessageList
              accountId={activeAccount.id}
              chatId={selectedChat.id}
              chatTitle={selectedChat.title}
            />
          ) : (
            <div className="empty-chat">
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                <circle cx="60" cy="60" r="50" fill="#E8E8E8"/>
                <path d="M40 50 L80 50 M40 70 L70 70" stroke="#999" strokeWidth="4" strokeLinecap="round"/>
              </svg>
              <p>Выберите чат, чтобы начать общение</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
