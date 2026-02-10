import { Chat } from '../../types/telegram';
import { useConnectionStore } from '../../store/connectionStore';

interface ChatHeaderProps {
  chat: Chat | null;
}

const STATUS_LABELS: Record<string, string> = {
  connected: 'в сети',
  connecting: 'подключение...',
  reconnecting: 'переподключение...',
  disconnected: 'не в сети',
};

export const ChatHeader = ({ chat }: ChatHeaderProps) => {
  const connectionStatus = useConnectionStore((s) => s.status);

  if (!chat) {
    return <div style={{ height: '56px' }} />;
  }

  return (
    <header className="content-header">
      <div className="content-header-info">
        <h3>{chat.title}</h3>
        <span className={`status status-${connectionStatus}`}>
          {STATUS_LABELS[connectionStatus] || connectionStatus}
        </span>
      </div>
      <div className="content-header-actions">
        <button className="icon-button" title="Search messages">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button className="icon-button" title="More options">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>
    </header>
  );
};
