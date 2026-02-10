interface ChatSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export const ChatSearchBar = ({ value, onChange }: ChatSearchBarProps) => {
  return (
    <div className="search-container">
      <input
        type="text"
        className="search-input"
        placeholder="Search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};
