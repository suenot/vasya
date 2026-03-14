import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef, memo, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useMessagesStore, MessageBase } from '../../store/messagesStore';
import { useTauriEvent } from '../../hooks/useTauriEvent';
import { Message } from '../../types/telegram';
import { MediaAttachment } from './MediaAttachment';
import { MessageInput } from './MessageInput';
import './MessageList.css';

interface MessageListProps {
  accountId: string;
  chatId: number;
  chatTitle: string;
  chatType?: 'user' | 'group' | 'channel';
  highlightedMessageId?: number | null;
  topicId?: number;
  onBackToTopics?: () => void;
}

export interface MessageListHandle {
  scrollToMessage: (messageId: number) => void;
}

// Media info from real-time events (no file_path — not downloaded yet)
interface MediaInfoEvent {
  mediaType: string;
  fileSize?: number;
  mimeType?: string;
}

// Event payload types matching Rust updates.rs (camelCase via serde rename_all)
interface NewMessageEvent {
  accountId: string;
  chatId: number;
  id: number;
  text: string | null;
  date: number;
  isOutgoing: boolean;
  fromUserId?: number;
  hasMedia: boolean;
  mediaType?: string;
  media?: MediaInfoEvent[];
}

interface MessageDeletedEvent {
  accountId: string;
  chatId: number;
  messageIds: number[];
}

const formatTime = (timestamp: number) =>
  new Date(timestamp * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

// 8 sender colors for group chats (Telegram-style palette)
const SENDER_COLORS = [
  '#E17076', // red
  '#7BC862', // green
  '#E5CA77', // yellow
  '#65AADD', // blue
  '#A695E7', // purple
  '#EE7AE6', // pink
  '#6EC9CB', // cyan
  '#FAA774', // orange
];

function getSenderColor(userId: number): string {
  return SENDER_COLORS[Math.abs(userId) % SENDER_COLORS.length];
}

// Generate initials for avatar fallback
function getInitials(userId: number): string {
  // Without real user names, use a letter based on userId
  const letter = String.fromCharCode(65 + (Math.abs(userId) % 26));
  return letter;
}

// Message grouping: messages from same sender within 3 minutes
const GROUP_TIME_THRESHOLD = 3 * 60; // seconds

interface GroupInfo {
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
}

function computeGrouping(messages: MessageBase[]): GroupInfo[] {
  const result: GroupInfo[] = new Array(messages.length);
  for (let i = 0; i < messages.length; i++) {
    const curr = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;

    const sameSenderAsPrev = prev
      && prev.is_outgoing === curr.is_outgoing
      && prev.from_user_id === curr.from_user_id
      && Math.abs(curr.date - prev.date) < GROUP_TIME_THRESHOLD;

    const sameSenderAsNext = next
      && next.is_outgoing === curr.is_outgoing
      && next.from_user_id === curr.from_user_id
      && Math.abs(next.date - curr.date) < GROUP_TIME_THRESHOLD;

    result[i] = {
      isFirstInGroup: !sameSenderAsPrev,
      isLastInGroup: !sameSenderAsNext,
    };
  }
  return result;
}

// Memoized message item — only re-renders when its own props change
const MessageItem = memo(({ message, accountId, chatId, isHighlighted, isGroupChat, groupInfo }: {
  message: MessageBase;
  accountId: string;
  chatId: number;
  isHighlighted?: boolean;
  isGroupChat: boolean;
  groupInfo: GroupInfo;
}) => {
  const { isFirstInGroup, isLastInGroup } = groupInfo;
  const showSenderName = isGroupChat && !message.is_outgoing && isFirstInGroup && message.from_user_id;
  const showAvatar = isGroupChat && !message.is_outgoing && isLastInGroup;
  const senderColor = message.from_user_id ? getSenderColor(message.from_user_id) : SENDER_COLORS[0];

  // Build bubble corner class
  let cornerClass = '';
  if (message.is_outgoing) {
    if (isFirstInGroup && isLastInGroup) cornerClass = 'bubble-single-out';
    else if (isFirstInGroup) cornerClass = 'bubble-first-out';
    else if (isLastInGroup) cornerClass = 'bubble-last-out';
    else cornerClass = 'bubble-mid-out';
  } else {
    if (isFirstInGroup && isLastInGroup) cornerClass = 'bubble-single-in';
    else if (isFirstInGroup) cornerClass = 'bubble-first-in';
    else if (isLastInGroup) cornerClass = 'bubble-last-in';
    else cornerClass = 'bubble-mid-in';
  }

  const groupSpacingClass = isFirstInGroup ? 'group-start' : 'group-continue';

  return (
    <div
      className={`message ${message.is_outgoing ? 'outgoing' : 'incoming'} ${groupSpacingClass}${isHighlighted ? ' highlighted' : ''}`}
      data-message-id={message.id}
    >
      {/* Avatar column for incoming group messages */}
      {isGroupChat && !message.is_outgoing && (
        <div className="message-avatar-col">
          {showAvatar && message.from_user_id ? (
            <div className="message-avatar" style={{ backgroundColor: senderColor }}>
              {getInitials(message.from_user_id)}
            </div>
          ) : (
            <div className="message-avatar-spacer" />
          )}
        </div>
      )}

      <div className="message-content">
        {/* Sender name for group chats */}
        {showSenderName && (
          <div className="message-sender-name" style={{ color: senderColor }}>
            User {message.from_user_id}
          </div>
        )}

        {message.media && message.media.length > 0 && (
          <div className={`message-media-standalone ${cornerClass}`}>
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
          <div className={`message-bubble ${cornerClass}`}>
            <div className="message-text">{message.text}</div>
            <div className="message-meta">
              <span className="message-time">{formatTime(message.date)}</span>
              {message.is_outgoing && (
                <span className="message-status">
                  {message._status === 'sending' ? (
                    <svg className="status-icon" viewBox="0 0 16 16" width="16" height="16">
                      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="25" strokeDashoffset="8">
                        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1s" repeatCount="indefinite"/>
                      </circle>
                    </svg>
                  ) : message._status === 'failed' ? (
                    <span className="status-failed">!</span>
                  ) : (
                    <svg className="status-icon status-sent" viewBox="0 0 16 11" width="16" height="11">
                      <path d="M11.5 0.5L4.5 7.5L1.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14.5 0.5L7.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
                    </svg>
                  )}
                </span>
              )}
            </div>
          </div>
        )}

        {!message.text && message.media && message.media.length > 0 && (
          <div className="message-meta-standalone">{formatTime(message.date)}</div>
        )}

        {!message.text && (!message.media || message.media.length === 0) && (
          <div className={`message-bubble ${cornerClass}`}>
            <div className="message-text text-muted">(empty message)</div>
            <div className="message-meta">
              <span className="message-time">{formatTime(message.date)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// Stable empty array — prevents Zustand from scheduling re-renders
// when messagesByChat[chatId] is undefined (Object.is([], []) === false)
const EMPTY_MESSAGES: any[] = [];

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(({ accountId, chatId, chatTitle, chatType, highlightedMessageId, topicId, onBackToTopics }, ref) => {
  const messages = useMessagesStore((s) => s.messagesByChat[chatId] ?? EMPTY_MESSAGES);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<number | null>(null);

  const isGroupChat = chatType === 'group';

  // Compute grouping info for all messages
  const groupInfos = useMemo(() => computeGrouping(messages), [messages]);

  // Expose scrollToMessage to parent
  useImperativeHandle(ref, () => ({
    scrollToMessage: (messageId: number) => {
      const el = containerRef.current?.querySelector(`[data-message-id="${messageId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      // Message not in DOM — load messages around this ID
      pendingScrollRef.current = messageId;
      invoke<Message[]>('get_messages', {
        accountId,
        chatId,
        offsetId: messageId + 1,
        limit: 50,
        topicId,
      }).then((fetched) => {
        if (fetched.length > 0) {
          useMessagesStore.getState().setMessages(chatId, fetched.reverse());
          useMessagesStore.getState().setHasMore(chatId, true);
        }
      }).catch((err) => {
        console.error('[MessageList] Failed to load messages for search:', err);
        pendingScrollRef.current = null;
      });
    },
  }), [accountId, chatId]);

  // Scroll to pending target after messages update
  useEffect(() => {
    if (!pendingScrollRef.current) return;
    const targetId = pendingScrollRef.current;
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector(`[data-message-id="${targetId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        pendingScrollRef.current = null;
      }
    });
  }, [messages]);

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
    // Reset state for new chat
    initialLoadDone.current = false;
    loadingRef.current = true;
    prevMessagesLength.current = 0; // Reset length tracker so it triggers auto-scroll on load


    const load = async () => {
      try {
        const fetched = await invoke<Message[]>('get_messages', {
          accountId,
          chatId,
          limit: 50,
          topicId,
        });
        setMessages(chatId, fetched.reverse());
        setHasMore(chatId, fetched.length === 50);
      } catch (err) {
        console.error('[MessageList] Failed to load messages:', err);
      } finally {
        loadingRef.current = false;
        initialLoadDone.current = true;
        // Force scroll to bottom after initial load, regardless of useEffect race conditions
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
          prevMessagesLength.current = useMessagesStore.getState().messagesByChat[chatId]?.length || 0;
        }, 50);
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
    // Also scroll if we were waiting for initial load and now we have messages
    if (prevMessagesLength.current === 0 && messages.length > 0) {
      // Use setTimeout to ensure DOM is fully painted
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 0);
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length]);

  // Real-time: new message
  useTauriEvent<NewMessageEvent>('telegram:new-message', useCallback((evt) => {
    if (evt.chatId !== chatId) return;
    // Convert event media info to the format expected by the store
    const media = evt.media?.map((m) => ({
      media_type: m.mediaType as any,
      file_size: m.fileSize,
      mime_type: m.mimeType,
    }));
    addMessage(chatId, {
      id: evt.id,
      chat_id: evt.chatId,
      from_user_id: evt.fromUserId,
      text: evt.text || undefined,
      date: evt.date,
      is_outgoing: evt.isOutgoing,
      media,
    });
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [chatId, addMessage]));

  // Real-time: message deleted
  useTauriEvent<MessageDeletedEvent>('telegram:message-deleted', useCallback((evt) => {
    if (evt.chatId !== chatId) return;
    for (const id of evt.messageIds) {
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
        topicId,
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

  return (
    <div className="messages-wrapper">
      {onBackToTopics && (
        <button className="back-to-topics" onClick={onBackToTopics}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          {chatTitle}
        </button>
      )}
      <div className="messages-container" ref={containerRef} onScroll={handleScroll}>
        {loadingRef.current && messages.length === 0 ? (
          <div className="messages-loading"><p>Loading messages...</p></div>
        ) : messages.length === 0 ? (
          <div className="messages-empty"><p>No messages in {chatTitle}</p></div>
        ) : (
          <div className="messages-list">
            {messages.map((message, index) => (
              <MessageItem
                key={message.id}
                message={message}
                accountId={accountId}
                chatId={chatId}
                isHighlighted={highlightedMessageId === message.id}
                isGroupChat={isGroupChat}
                groupInfo={groupInfos[index]}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <MessageInput
        accountId={accountId}
        chatId={chatId}
        topicId={topicId}
        onMessageSent={handleMessageSent}
      />
    </div>
  );
});
