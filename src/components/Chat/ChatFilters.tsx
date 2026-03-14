import { useTranslation, TranslationKey } from '../../i18n';
import { useFolderStore, BUILTIN_TAB_IDS } from '../../store/folderStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Icon } from '../UI/Icon';

interface ChatFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  unreadCounts?: Record<string, number>;
}

const BUILTIN_LABELS: Record<string, TranslationKey> = {
  all: 'all_chats' as TranslationKey,
  contacts: 'filter_contacts',
  chats: 'filter_chats',
  favorites: 'filter_favorites',
};

export const ChatFilters = ({ activeFilter, onFilterChange, unreadCounts }: ChatFiltersProps) => {
  const { t } = useTranslation();
  const folders = useFolderStore((s) => s.folders);
  const tabs = useFolderStore((s) => s.tabs);
  const folderLayout = useSettingsStore((s) => s.folderLayout);

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

  return (
    <div className={`chat-filters ${folderLayout}`}>
      {visibleTabs.map(tab => {
        const info = getTabInfo(tab.id);
        return (
          <button
            key={tab.id}
            className={`filter-button ${activeFilter === tab.id ? 'active' : ''}`}
            onClick={() => onFilterChange(tab.id)}
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
  );
};
