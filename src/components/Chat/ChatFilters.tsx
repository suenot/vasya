interface ChatFiltersProps {
  activeFilter: 'contacts' | 'chats' | 'favorites';
  onFilterChange: (filter: 'contacts' | 'chats' | 'favorites') => void;
}

const FILTERS: { key: ChatFiltersProps['activeFilter']; label: string }[] = [
  { key: 'contacts', label: 'Kontakty' },
  { key: 'chats', label: 'Chaty' },
  { key: 'favorites', label: 'Izbrannoe' },
];

export const ChatFilters = ({ activeFilter, onFilterChange }: ChatFiltersProps) => {
  return (
    <div className="chat-filters">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          className={`filter-button ${activeFilter === key ? 'active' : ''}`}
          onClick={() => onFilterChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
