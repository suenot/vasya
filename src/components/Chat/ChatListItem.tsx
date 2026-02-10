import { convertFileSrc } from '@tauri-apps/api/core';
import { Chat } from '../../types/telegram';

interface ChatListItemProps {
  chat: Chat;
  isSelected: boolean;
  isFavorite: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const ChatListItem = ({
  chat,
  isSelected,
  isFavorite,
  onClick,
  onContextMenu,
}: ChatListItemProps) => {
  const classNames = [
    'chat-item',
    isSelected ? 'selected' : '',
    isFavorite ? 'favorite' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="chat-avatar">
        {chat.avatarPath ? (
          <img
            src={convertFileSrc(chat.avatarPath)}
            alt={chat.title}
            className="avatar-image"
          />
        ) : (
          <span className="avatar-placeholder">
            {chat.title.substring(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="chat-info">
        <div className="chat-info-top">
          <div className="chat-title-row">
            <div className="chat-title">{chat.title}</div>
          </div>
          <div className="chat-meta-right">
            <div className="chat-time"></div>
          </div>
        </div>
        <div className="chat-info-bottom">
          <div className="chat-preview">
            {chat.lastMessage || 'No messages'}
          </div>
          {chat.unreadCount > 0 && (
            <div className="unread-count">{chat.unreadCount}</div>
          )}
        </div>
      </div>
    </div>
  );
};
