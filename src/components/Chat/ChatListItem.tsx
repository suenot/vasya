import { memo, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Chat } from '../../types/telegram';
import { useTranslation } from '../../i18n';

interface ChatListItemProps {
  chat: Chat;
  isSelected: boolean;
  isFavorite: boolean;
  onChatClick: (chatId: number) => void;
  onContextMenu: (e: React.MouseEvent, chatId: number) => void;
}

export const ChatListItem = memo(({
  chat,
  isSelected,
  isFavorite,
  onChatClick,
  onContextMenu,
}: ChatListItemProps) => {
  const { t } = useTranslation();
  const handleClick = useCallback(() => {
    onChatClick(chat.id);
  }, [onChatClick, chat.id]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    onContextMenu(e, chat.id);
  }, [onContextMenu, chat.id]);

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
      onClick={handleClick}
      onContextMenu={handleContextMenu}
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
            {chat.lastMessage || t('no_messages')}
          </div>
          {chat.unreadCount > 0 && (
            <div className="unread-count">{chat.unreadCount}</div>
          )}
        </div>
      </div>
    </div>
  );
});
