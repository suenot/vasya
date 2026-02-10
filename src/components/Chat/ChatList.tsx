import { Chat } from '../../types/telegram';
import { ChatSearchBar } from './ChatSearchBar';
import { ChatFilters } from './ChatFilters';
import { ChatListItem } from './ChatListItem';
import './ChatList.css';

interface ChatListProps {
  chats: Chat[];
  loading: boolean;
  error: string;
  selectedChatId: number | null;
  favorites: Set<number>;
  searchQuery: string;
  activeFilter: 'contacts' | 'chats' | 'favorites';
  onSearchChange: (value: string) => void;
  onFilterChange: (filter: 'contacts' | 'chats' | 'favorites') => void;
  onChatClick: (chatId: number) => void;
  onContextMenu: (e: React.MouseEvent, chatId: number) => void;
}

export const ChatList = ({
  chats,
  loading,
  error,
  selectedChatId,
  favorites,
  searchQuery,
  activeFilter,
  onSearchChange,
  onFilterChange,
  onChatClick,
  onContextMenu,
}: ChatListProps) => {
  return (
    <>
      <ChatSearchBar value={searchQuery} onChange={onSearchChange} />
      <ChatFilters activeFilter={activeFilter} onFilterChange={onFilterChange} />

      <div className="chat-list">
        {loading ? (
          <div className="empty-state">
            <p>Loading...</p>
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
              onClick={() => onChatClick(chat.id)}
              onContextMenu={(e) => onContextMenu(e, chat.id)}
            />
          ))
        ) : searchQuery.trim() ? (
          <div className="empty-state">
            <p>Nothing found</p>
          </div>
        ) : (
          <div className="empty-state" style={{ marginTop: '20px' }}>
            <p>
              Chats will appear here
              <br />
              after synchronization
            </p>
          </div>
        )}
      </div>
    </>
  );
};
