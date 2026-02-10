import { useEffect } from 'react';

interface ChatContextMenuProps {
  x: number;
  y: number;
  chatId: number;
  isFavorite: boolean;
  onToggleFavorite: (chatId: number) => void;
  onClose: () => void;
}

export const ChatContextMenu = ({
  x,
  y,
  chatId,
  isFavorite,
  onToggleFavorite,
  onClose,
}: ChatContextMenuProps) => {
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  return (
    <div className="context-menu" style={{ left: x, top: y }}>
      <button
        className="context-menu-item"
        onClick={() => onToggleFavorite(chatId)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={isFavorite ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
      </button>
    </div>
  );
};
