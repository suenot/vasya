import { memo } from 'react';
import { Chat, GlobalSearchResult, GlobalMessageResult } from '../../types/telegram';
import { ChatListItem } from './ChatListItem';
import { useTranslation } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import './ChatList.css';

interface ChatListProps {
  chats: Chat[];
  loading: boolean;
  error: string;
  selectedChatId: number | null;
  favorites: Set<number>;
  searchQuery: string;
  highlightedIndex: number;
  onChatClick: (chatId: number) => void;
  onContextMenu: (e: React.MouseEvent, chatId: number) => void;
  // New search props
  globalResults?: GlobalSearchResult[];
  globalLoading?: boolean;
  messageResults?: GlobalMessageResult[];
  messagesLoading?: boolean;
  onGlobalResultClick?: (result: GlobalSearchResult) => void;
  onMessageResultClick?: (result: GlobalMessageResult) => void;
  onShowMoreGlobal?: () => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatSubscribers(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

export const ChatList = memo(({
  chats,
  loading,
  error,
  selectedChatId,
  favorites,
  searchQuery,
  highlightedIndex,
  onChatClick,
  onContextMenu,
  globalResults,
  globalLoading,
  messageResults,
  messagesLoading,
  onGlobalResultClick,
  onMessageResultClick,
  onShowMoreGlobal,
}: ChatListProps) => {
  const { t } = useTranslation();
  const chatDensity = useSettingsStore((s) => s.chatDensity);
  const isSearchActive = searchQuery.trim().length > 0;

  // When search is active, show sectioned results
  if (isSearchActive) {
    const hasLocalResults = chats.length > 0;
    const hasGlobalResults = (globalResults && globalResults.length > 0);
    const hasMessageResults = (messageResults && messageResults.length > 0);
    const hasAnyResults = hasLocalResults || hasGlobalResults || hasMessageResults;

    return (
      <div className={`chat-list density-${chatDensity}`}>
        {loading && !hasAnyResults ? (
          <div className="empty-state">
            <p>{t('loading')}</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <p style={{ color: 'var(--error-color)' }}>{error}</p>
          </div>
        ) : (
          <>
            {/* Section 1: Contacts and Chats (local filter) */}
            {hasLocalResults && (
              <div className="search-section">
                <div className="search-section-header">
                  {t('contacts_and_chats')}
                </div>
                {chats.map((chat, index) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    isSelected={selectedChatId === chat.id}
                    isFavorite={favorites.has(chat.id)}
                    isHighlighted={highlightedIndex === index}
                    onChatClick={onChatClick}
                    onContextMenu={onContextMenu}
                  />
                ))}
              </div>
            )}

            {/* Section 2: Global Search */}
            <div className="search-section">
              <div className="search-section-header">
                {t('global_search')}
              </div>
              {globalLoading ? (
                <div className="search-section-loading">
                  <div className="search-spinner" />
                </div>
              ) : hasGlobalResults ? (
                <>
                  {globalResults!.map((result) => (
                    <div
                      key={`global-${result.resultType}-${result.id}`}
                      className="chat-item global-result-item"
                      onClick={() => onGlobalResultClick?.(result)}
                    >
                      <div className="chat-avatar">
                        <span className="avatar-placeholder">
                          {result.title.substring(0, 1).toUpperCase()}
                        </span>
                      </div>
                      <div className="chat-info">
                        <div className="chat-info-top">
                          <div className="chat-title-row">
                            <div className="chat-title">{result.title}</div>
                          </div>
                          <div className="chat-meta-right">
                            <span className="global-result-type">
                              {result.resultType === 'channel' ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                                </svg>
                              ) : result.resultType === 'group' ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                                  <circle cx="9" cy="7" r="4" />
                                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                                </svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                                  <circle cx="12" cy="7" r="4" />
                                </svg>
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="chat-info-bottom">
                          <div className="chat-preview global-result-meta">
                            {result.username && (
                              <span className="global-result-username">@{result.username}</span>
                            )}
                            {result.subscribersCount != null && result.subscribersCount > 0 && (
                              <span className="global-result-subs">
                                {formatSubscribers(result.subscribersCount)} {t('subscribers')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {onShowMoreGlobal && (
                    <button className="show-more-btn" onClick={onShowMoreGlobal}>
                      {t('show_more')}
                    </button>
                  )}
                </>
              ) : (
                <div className="search-section-empty">
                  {t('search_no_results')}
                </div>
              )}
            </div>

            {/* Section 3: Messages */}
            <div className="search-section">
              <div className="search-section-header">
                <span>{t('messages_section')}</span>
                <span className="search-section-badge">{t('from_all_chats')}</span>
              </div>
              {messagesLoading ? (
                <div className="search-section-loading">
                  <div className="search-spinner" />
                </div>
              ) : hasMessageResults ? (
                messageResults!.map((msg) => (
                  <div
                    key={`msg-${msg.chatId}-${msg.messageId}`}
                    className="chat-item message-result-item"
                    onClick={() => onMessageResultClick?.(msg)}
                  >
                    <div className="chat-avatar">
                      <span className="avatar-placeholder">
                        {msg.chatTitle.substring(0, 1).toUpperCase()}
                      </span>
                    </div>
                    <div className="chat-info">
                      <div className="chat-info-top">
                        <div className="chat-title-row">
                          <div className="chat-title">{msg.chatTitle}</div>
                        </div>
                        <div className="chat-meta-right">
                          <div className="chat-time">{formatDate(msg.date)}</div>
                        </div>
                      </div>
                      <div className="chat-info-bottom">
                        <div className="chat-preview message-result-preview">
                          {msg.senderName && (
                            <span className="preview-sender">{msg.senderName}: </span>
                          )}
                          {msg.text || ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="search-section-empty">
                  {t('search_no_results')}
                </div>
              )}
            </div>

            {/* Show overall empty state only if nothing found anywhere */}
            {!hasAnyResults && !globalLoading && !messagesLoading && (
              <div className="empty-state">
                <p>{t('nothing_found')}</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Normal (non-search) view
  return (
    <div className={`chat-list density-${chatDensity}`}>
        {loading ? (
          <div className="empty-state">
            <p>{t('loading')}</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <p style={{ color: 'var(--error-color)' }}>{error}</p>
          </div>
        ) : chats.length > 0 ? (
          chats.map((chat, index) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              isSelected={selectedChatId === chat.id}
              isFavorite={favorites.has(chat.id)}
              isHighlighted={highlightedIndex === index}
              onChatClick={onChatClick}
              onContextMenu={onContextMenu}
            />
          ))
        ) : searchQuery.trim() ? (
          <div className="empty-state">
            <p>{t('nothing_found')}</p>
          </div>
        ) : (
          <div className="empty-state" style={{ marginTop: '20px' }}>
            <p>
              {t('chats_will_appear')}
              <br />
              {t('after_sync')}
            </p>
          </div>
        )}
      </div>
  );
});
