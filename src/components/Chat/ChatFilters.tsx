import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation, TranslationKey } from '../../i18n';
import { useFolderStore, BUILTIN_TAB_IDS } from '../../store/folderStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Icon } from '../UI/Icon';

interface ChatFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  unreadCounts?: Record<string, number>;
  onReadAll?: (folderId: string) => void;
  onMuteAll?: (folderId: string) => void;
}

const BUILTIN_LABELS: Record<string, TranslationKey> = {
  all: 'all_chats' as TranslationKey,
  contacts: 'filter_contacts',
  chats: 'filter_chats',
  favorites: 'filter_favorites',
};

interface ContextMenuState {
  x: number;
  y: number;
  tabId: string;
}

export const ChatFilters = ({ activeFilter, onFilterChange, unreadCounts, onReadAll, onMuteAll }: ChatFiltersProps) => {
  const { t } = useTranslation();
  const folders = useFolderStore((s) => s.folders);
  const tabs = useFolderStore((s) => s.tabs);
  const deleteFolder = useFolderStore((s) => s.deleteFolder);
  const folderLayout = useSettingsStore((s) => s.folderLayout);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Build visible tabs from store order
  const folderIds = new Set(folders.map(f => f.id));
  const allValidIds = new Set([...BUILTIN_TAB_IDS, ...folderIds]);
  const visibleTabs = tabs.filter(tab => tab.visible && allValidIds.has(tab.id));

  const getTabInfo = (tabId: string) => {
    const builtinLabel = BUILTIN_LABELS[tabId];
    if (builtinLabel) {
      const iconMap: Record<string, string> = {
        all: 'all',
        contacts: 'contacts',
        chats: 'chats',
        favorites: 'favorites',
      };
      return {
        label: t(builtinLabel) || tabId,
        icon: iconMap[tabId] || 'folder'
      };
    }
    const folder = folders.find(f => f.id === tabId);
    return {
      label: folder?.name ?? tabId,
      icon: folder?.icon ?? 'folder'
    };
  };

  const isCustomFolder = (tabId: string) => {
    return !(BUILTIN_TAB_IDS as readonly string[]).includes(tabId);
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const handleReadAll = () => {
    if (contextMenu && onReadAll) {
      onReadAll(contextMenu.tabId);
    }
    setContextMenu(null);
  };

  const handleMuteAll = () => {
    if (contextMenu && onMuteAll) {
      onMuteAll(contextMenu.tabId);
    }
    setContextMenu(null);
  };

  const handleDeleteFolder = () => {
    if (contextMenu && isCustomFolder(contextMenu.tabId)) {
      if (confirm(t('delete_folder_confirm'))) {
        deleteFolder(contextMenu.tabId);
      }
    }
    setContextMenu(null);
  };

  return (
    <>
      <div className={`chat-filters ${folderLayout}`}>
        {visibleTabs.map(tab => {
          const info = getTabInfo(tab.id);
          return (
            <button
              key={tab.id}
              className={`filter-button ${activeFilter === tab.id ? 'active' : ''}`}
              onClick={() => onFilterChange(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              title={info.label}
            >
              <span className="filter-icon-wrapper">
                {folderLayout === 'vertical' && <Icon name={info.icon} size={24} className="filter-icon" />}
                {unreadCounts && unreadCounts[tab.id] > 0 && (
                  <span className="folder-unread-badge">
                    {unreadCounts[tab.id] > 99 ? '99+' : unreadCounts[tab.id]}
                  </span>
                )}
              </span>
              <span className="filter-label">{info.label}</span>
            </button>
          );
        })}
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 10000,
          }}
        >
          {isCustomFolder(contextMenu.tabId) && (
            <button className="context-menu-item" onClick={() => setContextMenu(null)}>
              <span className="context-menu-icon">✏️</span>
              {t('edit_folder')}
            </button>
          )}
          {isCustomFolder(contextMenu.tabId) && (
            <button className="context-menu-item" onClick={() => setContextMenu(null)}>
              <span className="context-menu-icon">➕</span>
              {t('add_chats')}
            </button>
          )}
          <button className="context-menu-item" onClick={handleReadAll}>
            <span className="context-menu-icon">✓</span>
            {t('read_all')}
          </button>
          <button className="context-menu-item" onClick={handleMuteAll}>
            <span className="context-menu-icon">🔇</span>
            {t('mute_all')}
          </button>
          {isCustomFolder(contextMenu.tabId) && (
            <>
              <div className="context-menu-separator" />
              <button className="context-menu-item destructive" onClick={handleDeleteFolder}>
                <span className="context-menu-icon">🗑</span>
                {t('delete_folder')}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
};
