import { useTranslation, TranslationKey } from '../../i18n';

interface ChatFiltersProps {
  activeFilter: 'contacts' | 'chats' | 'favorites';
  onFilterChange: (filter: 'contacts' | 'chats' | 'favorites') => void;
}

const FILTER_KEYS: { key: ChatFiltersProps['activeFilter']; labelKey: TranslationKey }[] = [
  { key: 'contacts', labelKey: 'filter_contacts' },
  { key: 'chats', labelKey: 'filter_chats' },
  { key: 'favorites', labelKey: 'filter_favorites' },
];

export const ChatFilters = ({ activeFilter, onFilterChange }: ChatFiltersProps) => {
  const { t } = useTranslation();
  return (
    <div className="chat-filters">
      {FILTER_KEYS.map(({ key, labelKey }) => (
        <button
          key={key}
          className={`filter-button ${activeFilter === key ? 'active' : ''}`}
          onClick={() => onFilterChange(key)}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
};
