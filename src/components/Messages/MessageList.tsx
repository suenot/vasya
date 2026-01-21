import { useEffect, useState, useRef, useCallback } from 'react';
import { useTauriCommand } from '../../hooks/useTauriCommand';
import { Message } from '../../types/telegram';
import './MessageList.css';

interface MessageListProps {
  accountId: string;
  chatId: number;
  chatTitle: string;
}

export const MessageList = ({ accountId, chatId, chatTitle }: MessageListProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const getMessages = useTauriCommand<Message[], {
    accountId: string;
    chatId: number;
    offsetId?: number;
    limit?: number;
  }>('get_messages');

  // Загрузка первых сообщений
  useEffect(() => {
    const loadInitialMessages = async () => {
      try {
        setLoading(true);
        setError('');
        console.log('[MessageList] Loading messages for chat:', chatId);

        const fetchedMessages = await getMessages({
          accountId,
          chatId,
          limit: 50,
        });

        console.log('[MessageList] Messages loaded:', fetchedMessages.length);
        setMessages(fetchedMessages.reverse()); // Реверсируем для хронологического порядка
        setHasMore(fetchedMessages.length === 50);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Ошибка загрузки сообщений';
        console.error('[MessageList] Failed to load messages:', err);
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    loadInitialMessages();
  }, [chatId, accountId]);

  // Прокрутка вниз при первой загрузке
  useEffect(() => {
    if (!loading && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [loading]);

  // Загрузка старых сообщений
  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;

    try {
      setLoadingMore(true);
      const oldestMessage = messages[0];

      const olderMessages = await getMessages({
        accountId,
        chatId,
        offsetId: oldestMessage.id,
        limit: 50,
      });

      if (olderMessages.length === 0) {
        setHasMore(false);
      } else {
        setMessages(prev => [...olderMessages.reverse(), ...prev]);
        setHasMore(olderMessages.length === 50);
      }
    } catch (err) {
      console.error('[MessageList] Failed to load more messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages, accountId, chatId]);

  // Обработчик скролла для lazy loading
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop === 0 && hasMore && !loadingMore) {
      loadMoreMessages();
    }
  };

  if (loading) {
    return (
      <div className="messages-loading">
        <p>Загрузка сообщений...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="messages-error">
        <p style={{ color: '#e53935' }}>{error}</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="messages-empty">
        <p>Нет сообщений в чате с {chatTitle}</p>
      </div>
    );
  }

  return (
    <div className="messages-container" onScroll={handleScroll}>
      {loadingMore && (
        <div className="loading-more">
          <p>Загрузка старых сообщений...</p>
        </div>
      )}
      <div className="messages-list">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.is_outgoing ? 'outgoing' : 'incoming'}`}
          >
            <div className="message-bubble">
              <div className="message-text">{message.text || '(медиа)'}</div>
              <div className="message-meta">
                {new Date(message.date * 1000).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
