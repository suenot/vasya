import { convertFileSrc } from '@tauri-apps/api/core';
import { Chat } from '../../types/telegram';

interface ChatInfoPanelProps {
  chat: Chat;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  user: 'User',
  group: 'Group',
  channel: 'Channel',
};

export const ChatInfoPanel = ({ chat, onClose }: ChatInfoPanelProps) => {
  const avatarSrc = chat.avatarPath ? convertFileSrc(chat.avatarPath) : null;
  const initial = chat.title.charAt(0).toUpperCase();

  return (
    <div className="chat-info-panel">
      <div className="chat-info-panel-header">
        <h3>Chat Info</h3>
        <button className="icon-button" onClick={onClose} title="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="chat-info-panel-body">
        <div className="chat-info-avatar">
          {avatarSrc ? (
            <img src={avatarSrc} alt={chat.title} />
          ) : (
            initial
          )}
        </div>

        <div className="chat-info-details">
          <div className="chat-info-title">{chat.title}</div>
          {chat.username && (
            <div className="chat-info-username">@{chat.username}</div>
          )}
          <div className="chat-info-type">{TYPE_LABELS[chat.chatType] || chat.chatType}</div>
        </div>

        <div className="chat-info-section">
          <div className="chat-info-section-title">Details</div>
          <div className="chat-info-row">
            <span className="chat-info-row-label">Type</span>
            <span className="chat-info-row-value">{TYPE_LABELS[chat.chatType] || chat.chatType}</span>
          </div>
          {chat.username && (
            <div className="chat-info-row">
              <span className="chat-info-row-label">Username</span>
              <span className="chat-info-row-value">@{chat.username}</span>
            </div>
          )}
          <div className="chat-info-row">
            <span className="chat-info-row-label">ID</span>
            <span className="chat-info-row-value">{chat.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
