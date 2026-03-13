import { useTranslation, TranslationKey } from '../../i18n';
import { useFolderStore, BUILTIN_TAB_IDS } from '../../store/folderStore';

interface ChatFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

const BUILTIN_LABELS: Record<string, TranslationKey> = {
  all: 'all_chats' as TranslationKey,
  contacts: 'filter_contacts',
  chats: 'filter_chats',
  favorites: 'filter_favorites',
};

export const ChatFilters = ({ activeFilter, onFilterChange }: ChatFiltersProps) => {
  const { t } = useTranslation();
  const folders = useFolderStore((s) => s.folders);
  const tabs = useFolderStore((s) => s.tabs);

  // Build visible tabs from store order
  const folderIds = new Set(folders.map(f => f.id));
  const allValidIds = new Set([...BUILTIN_TAB_IDS, ...folderIds]);
  const visibleTabs = tabs.filter(tab => tab.visible && allValidIds.has(tab.id));

  const getLabel = (tabId: string): string => {
    const builtinLabel = BUILTIN_LABELS[tabId];
    if (builtinLabel) {
      return t(builtinLabel) || tabId;
    }
    const folder = folders.find(f => f.id === tabId);
    return folder?.name ?? tabId;
  };

  return (
    <div className="chat-filters">
      {visibleTabs.map(tab => (
        <button
          key={tab.id}
          className={`filter-button ${activeFilter === tab.id ? 'active' : ''}`}
          onClick={() => onFilterChange(tab.id)}
        >
          {getLabel(tab.id)}
        </button>
      ))}
    </div>
  );
};
