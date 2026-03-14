import { useRef, useEffect, useCallback, useMemo } from 'react';
import './MessageContextMenu.css';

interface MessageContextMenuProps {
  x: number;
  y: number;
  messageId: number;
  messageText?: string;
  isOutgoing: boolean;
  hasMedia: boolean;
  isMarkdownRendered: boolean;
  hasMarkdownContent: boolean;
  onClose: () => void;
  onReply: (messageId: number) => void;
  onForward: (messageId: number) => void;
  onSelect: (messageId: number) => void;
  onDelete: (messageId: number) => void;
  onPin: (messageId: number) => void;
  onEdit: (messageId: number) => void;
  onCopyText: (text: string) => void;
  onToggleMarkdown: (messageId: number) => void;
}

const REACTION_EMOJIS = ['\u{1F44D}', '\u{1F525}', '\u{2764}\u{FE0F}', '\u{1F64F}', '\u{1F601}', '\u{1F92F}', '\u{1F631}'];

const MENU_WIDTH = 220;
const MENU_ESTIMATED_HEIGHT = 400;
const VIEWPORT_PADDING = 8;

export const MessageContextMenu = ({
  x,
  y,
  messageId,
  messageText,
  isOutgoing,
  hasMedia,
  isMarkdownRendered,
  hasMarkdownContent,
  onClose,
  onReply,
  onForward,
  onSelect,
  onDelete,
  onPin,
  onEdit,
  onCopyText,
  onToggleMarkdown,
}: MessageContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate position to stay within viewport
  const position = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let posX = x;
    let posY = y;

    if (posX + MENU_WIDTH > vw - VIEWPORT_PADDING) {
      posX = vw - MENU_WIDTH - VIEWPORT_PADDING;
    }
    if (posX < VIEWPORT_PADDING) {
      posX = VIEWPORT_PADDING;
    }

    if (posY + MENU_ESTIMATED_HEIGHT > vh - VIEWPORT_PADDING) {
      posY = vh - MENU_ESTIMATED_HEIGHT - VIEWPORT_PADDING;
    }
    if (posY < VIEWPORT_PADDING) {
      posY = VIEWPORT_PADDING;
    }

    return { left: posX, top: posY };
  }, [x, y]);

  // Close on click outside
  const handleOverlayMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Adjust position after render if needed (actual height)
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;

    if (rect.bottom > vh - VIEWPORT_PADDING) {
      menuRef.current.style.top = `${vh - rect.height - VIEWPORT_PADDING}px`;
    }
  }, []);

  const handleReaction = (emoji: string) => {
    // For now, reactions just close the menu.
    // The parent can extend this via an onReaction prop in the future.
    void emoji;
    onClose();
  };

  return (
    <div className="message-context-menu-overlay" onMouseDown={handleOverlayMouseDown}>
      <div
        className="message-context-menu"
        ref={menuRef}
        style={{ left: position.left, top: position.top }}
      >
        {/* Emoji reaction bar */}
        <div className="context-menu-emoji-bar">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="context-menu-emoji-btn"
              onClick={() => handleReaction(emoji)}
              type="button"
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="context-menu-divider" />

        {/* Menu items */}
        <div className="context-menu-items">
          {/* Reply */}
          <button
            className="context-menu-item"
            onClick={() => { onReply(messageId); onClose(); }}
            type="button"
          >
            <span className="context-menu-item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 17 4 12 9 7" />
                <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
              </svg>
            </span>
            <span className="context-menu-item-label">Reply</span>
          </button>

          {/* Copy text */}
          {messageText && (
            <button
              className="context-menu-item"
              onClick={() => { onCopyText(messageText); onClose(); }}
              type="button"
            >
              <span className="context-menu-item-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </span>
              <span className="context-menu-item-label">Copy</span>
            </button>
          )}

          {/* Render / Hide Markdown */}
          {hasMarkdownContent && messageText && (
            <button
              className="context-menu-item"
              onClick={() => { onToggleMarkdown(messageId); onClose(); }}
              type="button"
            >
              <span className="context-menu-item-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {isMarkdownRendered ? (
                    <>
                      <path d="M17 6.1H3" />
                      <path d="M21 12.1H3" />
                      <path d="M15.1 18H3" />
                    </>
                  ) : (
                    <>
                      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                      <path d="M13 13l6 6" />
                    </>
                  )}
                </svg>
              </span>
              <span className="context-menu-item-label">
                {isMarkdownRendered ? 'Show Plain Text' : 'Render Markdown'}
              </span>
            </button>
          )}

          {/* Copy Media */}
          {hasMedia && (
            <button
              className="context-menu-item"
              onClick={() => { onClose(); }}
              type="button"
            >
              <span className="context-menu-item-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </span>
              <span className="context-menu-item-label">Copy Media</span>
            </button>
          )}

          {/* Save As */}
          {hasMedia && (
            <button
              className="context-menu-item"
              onClick={() => { onClose(); }}
              type="button"
            >
              <span className="context-menu-item-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </span>
              <span className="context-menu-item-label">Save As...</span>
            </button>
          )}

          {/* Edit (outgoing only) */}
          {isOutgoing && (
            <button
              className="context-menu-item"
              onClick={() => { onEdit(messageId); onClose(); }}
              type="button"
            >
              <span className="context-menu-item-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </span>
              <span className="context-menu-item-label">Edit</span>
            </button>
          )}

          {/* Pin */}
          <button
            className="context-menu-item"
            onClick={() => { onPin(messageId); onClose(); }}
            type="button"
          >
            <span className="context-menu-item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
              </svg>
            </span>
            <span className="context-menu-item-label">Pin</span>
          </button>

          {/* Forward */}
          <button
            className="context-menu-item"
            onClick={() => { onForward(messageId); onClose(); }}
            type="button"
          >
            <span className="context-menu-item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 17 20 12 15 7" />
                <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
              </svg>
            </span>
            <span className="context-menu-item-label">Forward</span>
          </button>

          {/* Select */}
          <button
            className="context-menu-item"
            onClick={() => { onSelect(messageId); onClose(); }}
            type="button"
          >
            <span className="context-menu-item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </span>
            <span className="context-menu-item-label">Select</span>
          </button>

          <div className="context-menu-divider" />

          {/* Delete */}
          <button
            className="context-menu-item context-menu-item--danger"
            onClick={() => { onDelete(messageId); onClose(); }}
            type="button"
          >
            <span className="context-menu-item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </span>
            <span className="context-menu-item-label">Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
