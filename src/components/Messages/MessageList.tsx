import { useEffect, useState, useRef, useCallback } from 'react';
import { useTauriCommand } from '../../hooks/useTauriCommand';
import { Message, MediaInfo } from '../../types/telegram';
import { convertFileSrc } from '@tauri-apps/api/core';
import { MessageInput } from './MessageInput';
import './MessageList.css';

interface MessageListProps {
  accountId: string;
  chatId: number;
  chatTitle: string;
}

// Компонент для рендеринга медиа
const MediaAttachment = ({ media, accountId, chatId, messageId, messageText }: {
  media: MediaInfo;
  accountId: string;
  chatId: number;
  messageId: number;
  messageText?: string;
}) => {
  const [loading, setLoading] = useState(false);
  const [loadedMedia, setLoadedMedia] = useState<MediaInfo | null>(null);
  const downloadMedia = useTauriCommand<MediaInfo[] | null, {
    accountId: string;
    chatId: number;
    messageId: number;
  }>('download_media');

  // Автоматически загружаем медиа при монтировании компонента
  useEffect(() => {
    // Не загружаем webpage - это просто превью ссылки
    if (media.media_type === 'webpage') {
      return;
    }

    // Проверяем, нужно ли загружать медиа
    const needsDownload = !media.file_path || media.file_path.trim() === '';

    if (needsDownload && !loadedMedia && !loading) {
      console.log('[MediaAttachment] Auto-downloading media for message:', messageId);

      const autoDownload = async () => {
        try {
          setLoading(true);
          console.log('[MediaAttachment] Requesting download for message:', messageId);

          const downloaded = await downloadMedia({ accountId, chatId, messageId });

          if (downloaded && downloaded.length > 0) {
            console.log('[MediaAttachment] ✓ Media downloaded successfully:', downloaded[0]);
            setLoadedMedia(downloaded[0]);
          } else {
            console.warn('[MediaAttachment] ⚠ No media returned from download');
          }
        } catch (error) {
          console.error('[MediaAttachment] ✗ Failed to download media:', error);
          console.error('[MediaAttachment] Error details:', {
            messageId,
            chatId,
            accountId,
            error: error instanceof Error ? error.message : String(error)
          });
        } finally {
          setLoading(false);
        }
      };

      autoDownload();
    }
  }, [media.file_path, accountId, chatId, messageId, loadedMedia, loading, downloadMedia]);

  const currentMedia = loadedMedia || media;

  // WebPage preview - обрабатываем отдельно, т.к. не требует загрузки файла
  if (media.media_type === 'webpage') {
    // Пытаемся извлечь URL из текста сообщения
    const urlMatch = messageText?.match(/(https?:\/\/[^\s]+)/);
    const url = urlMatch ? urlMatch[1] : null;

    return (
      <div className="media-webpage">
        <div className="webpage-icon">🔗</div>
        <div className="webpage-content">
          <div className="webpage-title">Link Preview</div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="webpage-url">
              {url.length > 50 ? url.substring(0, 50) + '...' : url}
            </a>
          )}
        </div>
      </div>
    );
  }

  // Показываем плейсхолдер только если файл еще не загружен
  if (!currentMedia.file_path || currentMedia.file_path.trim() === '') {
    return (
      <div className="media-placeholder">
        {loading ? (
          <div>⏳ Загружаем {media.media_type}...</div>
        ) : (
          <div>📎 {media.media_type} (не удалось загрузить)</div>
        )}
      </div>
    );
  }

  // convertFileSrc преобразует абсолютный путь в asset:// URL
  const fileSrc = convertFileSrc(currentMedia.file_path);

  switch (media.media_type) {

    case 'photo':
      return (
        <div className="media-photo">
          <img
            src={fileSrc}
            alt={currentMedia.file_name || 'Photo'}
            loading="lazy"
            style={{ maxWidth: '100%', borderRadius: '8px' }}
          />
        </div>
      );

    case 'video':
      return (
        <div className="media-video">
          <video
            src={fileSrc}
            controls
            style={{ maxWidth: '100%', borderRadius: '8px' }}
          />
        </div>
      );

    case 'audio':
    case 'voice':
      return (
        <div className="media-audio">
          <audio src={fileSrc} controls style={{ width: '100%' }} />
          {currentMedia.file_name && <div className="file-name">{currentMedia.file_name}</div>}
        </div>
      );

    case 'document':
      return (
        <div className="media-document">
          <a href={fileSrc} download={currentMedia.file_name} className="document-link">
            📄 {currentMedia.file_name || 'Документ'}
            {currentMedia.file_size && ` (${formatFileSize(currentMedia.file_size)})`}
          </a>
        </div>
      );

    case 'sticker':
      return (
        <div className="media-sticker">
          <img
            src={fileSrc}
            alt="Sticker"
            style={{ maxWidth: '200px', maxHeight: '200px' }}
          />
        </div>
      );

    default:
      return (
        <div className="media-other">
          <a href={fileSrc} download={currentMedia.file_name}>
            📎 {currentMedia.file_name || currentMedia.media_type}
          </a>
        </div>
      );
  }
};

// Вспомогательная функция для форматирования размера файла
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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
        setMessages([]); // Очищаем старые сообщения при смене чата
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
  }, [chatId, accountId, getMessages]);

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

  // Обработчик отправки нового сообщения
  const handleMessageSent = useCallback((newMessage: Message) => {
    setMessages(prev => [...prev, newMessage]);
    // Прокрутка вниз к новому сообщению
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

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
    <div className="messages-wrapper">
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
              <div className="message-content">
                {/* Медиа вне bubble - как в оригинальном Telegram */}
                {message.media && message.media.length > 0 && (
                  <div className="message-media-standalone">
                    {message.media.map((media, index) => (
                      <MediaAttachment
                        key={index}
                        media={media}
                        accountId={accountId}
                        chatId={chatId}
                        messageId={message.id}
                        messageText={message.text}
                      />
                    ))}
                  </div>
                )}

                {/* Текст в bubble - только если есть текст */}
                {message.text && (
                  <div className="message-bubble">
                    <div className="message-text">{message.text}</div>
                    <div className="message-meta">
                      {new Date(message.date * 1000).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                )}

                {/* Если только медиа без текста - показываем время под медиа */}
                {!message.text && message.media && message.media.length > 0 && (
                  <div className="message-meta-standalone">
                    {new Date(message.date * 1000).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                )}

                {/* Placeholder если нет ни текста, ни медиа */}
                {!message.text && (!message.media || message.media.length === 0) && (
                  <div className="message-bubble">
                    <div className="message-text text-muted">(пустое сообщение)</div>
                    <div className="message-meta">
                      {new Date(message.date * 1000).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <MessageInput
        accountId={accountId}
        chatId={chatId}
        onMessageSent={handleMessageSent}
      />
    </div>
  );
};
