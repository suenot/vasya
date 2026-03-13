import { useEffect, useState, useRef } from 'react';
import { useTranslation } from '../../i18n';
import { useFolderStore } from '../../store/folderStore';

interface ChatContextMenuProps {
  x: number;
  y: number;
  chatId: number;
  isFavorite: boolean;
  onToggleFavorite: (chatId: number) => void;
  onClose: () => void;
}

export const ChatContextMenu = ({ x, y, chatId, isFavorite, onToggleFavorite, onClose }: ChatContextMenuProps) => {
  const { t } = useTranslation();
  const [showFolders, setShowFolders] = useState(false);
  const folders = useFolderStore((s) => s.folders);
  const addChatToFolder = useFolderStore((s) => s.addChatToFolder);
  const removeChatFromFolder = useFolderStore((s) => s.removeChatFromFolder);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (submenuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  const isChatInFolder = (folderId: string) =>
    folders.find(f => f.id === folderId)?.includedChatIds.includes(chatId) ?? false;

  const handleFolderToggle = (folderId: string) => {
    if (isChatInFolder(folderId)) {
      removeChatFromFolder(folderId, chatId);
    } else {
      addChatToFolder(folderId, chatId);
    }
  };

  return (
    <div ref={menuRef} className="context-menu" style={{ left: x, top: y }}>
      <button className="context-menu-item" onClick={() => onToggleFavorite(chatId)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        {isFavorite ? t('remove_from_favorites') : t('add_to_favorites')}
      </button>

      {folders.length > 0 && (
        <div
          className="context-menu-item context-menu-submenu-trigger"
          onMouseEnter={() => setShowFolders(true)}
          onMouseLeave={() => setShowFolders(false)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ flex: 1 }}>{t('add_to_folder' as any) || 'Add to folder'}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>

          {showFolders && (
            <div ref={submenuRef} className="context-menu context-submenu">
              {folders.map(folder => {
                const isIn = isChatInFolder(folder.id);
                return (
                  <button
                    key={folder.id}
                    className="context-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFolderToggle(folder.id);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {isIn
                        ? <><rect x="3" y="3" width="18" height="18" rx="2" /><polyline points="9 11 12 14 22 4" /></>
                        : <rect x="3" y="3" width="18" height="18" rx="2" />
                      }
                    </svg>
                    {folder.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
