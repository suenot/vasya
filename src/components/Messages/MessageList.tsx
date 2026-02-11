import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useMessagesStore } from '../../store/messagesStore';
import { useTauriEvent } from '../../hooks/useTauriEvent';
import { Message } from '../../types/telegram';
import { MediaAttachment } from './MediaAttachment';
import { MessageInput } from './MessageInput';
import './MessageList.css';

interface MessageListProps {
  accountId: string;
  chatId: number;
  chatTitle: string;
}

// Event payload types matching Rust updates.rs
interface NewMessageEvent {
  account_id: string;
  chat_id: number;
  message_id: number;
  text: string;
  date: number;
  is_outgoing: boolean;
  sender_id?: number;
}

interface MessageDeletedEvent {
  account_id: string;
  chat_id: number;
  message_ids: number[];
}

const formatTime = (timestamp: number) =>
  new Date(timestamp * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

export const MessageList = ({ accountId, chatId, chatTitle }: MessageListProps) => {
  const messages = useMessagesStore((s) => s.messagesByChat[chatId] || []);
  const hasMore = useMessagesStore((s) => s.hasMoreByChat[chatId] ?? true);
  const setMessages = useMessagesStore((s) => s.setMessages);
  const prependMessages = useMessagesStore((s) => s.prependMessages);
  const addMessage = useMessagesStore((s) => s.addMessage);
  const removeMessage = useMessagesStore((s) => s.removeMessage);
  const setHasMore = useMessagesStore((s) => s.setHasMore);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const initialLoadDone = useRef(false);

  // Load initial messages
  useEffect(() => {
    initialLoadDone.current = false;
    loadingRef.current = true;

    const load = async () => {
      try {
        const fetched = await invoke<Message[]>('get_messages', {
          accountId,
          chatId,
          limit: 50,
        });
        setMessages(chatId, fetched.reverse());
        setHasMore(chatId, fetched.length === 50);
      } catch (err) {
        console.error('[MessageList] Failed to load messages:', err);
      } finally {
        loadingRef.current = false;
        initialLoadDone.current = true;
      }
    };

    load();
  }, [chatId, accountId, setMessages, setHasMore]);

  // Scroll to bottom only on initial load (not on prepend)
  const prevMessagesLength = useRef(0);
  useEffect(() => {
    if (!initialLoadDone.current) return;

    // Only auto-scroll when it's the initial load for this chat
    // (length went from 0 to N) — NOT on prepend (length grows at start)
    if (prevMessagesLength.current === 0 && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length]);

  // Real-time: new message
  useTauriEvent<NewMessageEvent>('telegram:new-message', useCallback((evt) => {
    if (evt.chat_id !== chatId) return;
    addMessage(chatId, {
      id: evt.message_id,
      chat_id: evt.chat_id,
      from_user_id: evt.sender_id,
      text: evt.text || undefined,
      date: evt.date,
      is_outgoing: evt.is_outgoing,
    });
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [chatId, addMessage]));

  // Real-time: message deleted
  useTauriEvent<MessageDeletedEvent>('telegram:message-deleted', useCallback((evt) => {
    if (evt.chat_id !== chatId) return;
    for (const id of evt.message_ids) {
      removeMessage(chatId, id);
    }
  }, [chatId, removeMessage]));

  // Load older messages on scroll to top
  const handleScroll = useCallback(async (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop > 0 || !hasMore || loadingMoreRef.current || messages.length === 0) return;

    loadingMoreRef.current = true;
    try {
      const oldest = messages[0];
      const older = await invoke<Message[]>('get_messages', {
        accountId,
        chatId,
        offsetId: oldest.id,
        limit: 50,
      });
      if (older.length === 0) {
        setHasMore(chatId, false);
      } else {
        prependMessages(chatId, older.reverse());
        setHasMore(chatId, older.length === 50);
      }
    } catch (err) {
      console.error('[MessageList] Failed to load more:', err);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [hasMore, messages, accountId, chatId, prependMessages, setHasMore]);

  // Callback for MessageInput
  const handleMessageSent = useCallback((newMessage: Message) => {
    addMessage(chatId, newMessage);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [chatId, addMessage]);

  if (loadingRef.current && messages.length === 0) {
    return <div className="messages-loading"><p>Загрузка сообщений...</p></div>;
  }

  if (messages.length === 0) {
    return <div className="messages-empty"><p>Нет сообщений в чате с {chatTitle}</p></div>;
  }

  return (
    <div className="messages-wrapper">
      <div className="messages-container" onScroll={handleScroll}>
        <div className="messages-list">
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.is_outgoing ? 'outgoing' : 'incoming'}`}>
              <div className="message-content">
                {message.media && message.media.length > 0 && (
                  <div className="message-media-standalone">
                    {message.media.map((media: any, index: number) => (
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

                {message.text && (
                  <div className="message-bubble">
                    <div className="message-text">{message.text}</div>
                    <div className="message-meta">{formatTime(message.date)}</div>
                  </div>
                )}

                {!message.text && message.media && message.media.length > 0 && (
                  <div className="message-meta-standalone">{formatTime(message.date)}</div>
                )}

                {!message.text && (!message.media || message.media.length === 0) && (
                  <div className="message-bubble">
                    <div className="message-text text-muted">(пустое сообщение)</div>
                    <div className="message-meta">{formatTime(message.date)}</div>
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
