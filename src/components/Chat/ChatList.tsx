import { memo } from 'react';
import { Chat } from '../../types/telegram';
import { ChatFilters } from './ChatFilters';
import { ChatListItem } from './ChatListItem';
import { useTranslation } from '../../i18n';
import './ChatList.css';

interface ChatListProps {
  chats: Chat[];
  loading: boolean;
  error: string;
  selectedChatId: number | null;
  favorites: Set<number>;
  searchQuery: string;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  onChatClick: (chatId: number) => void;
  onContextMenu: (e: React.MouseEvent, chatId: number) => void;
}

export const ChatList = memo(({
  chats,
  loading,
  error,
  selectedChatId,
  favorites,
  searchQuery,
  activeFilter,
  onFilterChange,
  onChatClick,
  onContextMenu,
}: ChatListProps) => {
  const { t } = useTranslation();
  return (
    <>
      <ChatFilters activeFilter={activeFilter} onFilterChange={onFilterChange} />

      <div className="chat-list">
        {loading ? (
          <div className="empty-state">
            <p>{t('loading')}</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <p style={{ color: 'var(--error-color)' }}>{error}</p>
          </div>
        ) : chats.length > 0 ? (
          chats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              isSelected={selectedChatId === chat.id}
              isFavorite={favorites.has(chat.id)}
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
    </>
  );
});
