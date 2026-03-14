import { useSelectionStore } from '../../store/selectionStore';
import './SelectionBar.css';

interface SelectionBarProps {
  onForward: (ids: number[]) => void;
  onDelete: (ids: number[]) => void;
  onCopy: (ids: number[]) => void;
}

export function SelectionBar({ onForward, onDelete, onCopy }: SelectionBarProps) {
  const selectedIds = useSelectionStore((s) => s.selectedMessageIds);
  const exitSelectionMode = useSelectionStore((s) => s.exitSelectionMode);
  const count = selectedIds.size;

  if (count === 0) return null;

  const ids = Array.from(selectedIds);

  return (
    <div className="selection-bar">
      <button className="selection-bar-close" onClick={exitSelectionMode} title="Cancel">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <span className="selection-bar-count">{count} selected</span>

      <div className="selection-bar-actions">
        <button className="selection-bar-btn" onClick={() => onCopy(ids)} title="Copy">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>
        <button className="selection-bar-btn" onClick={() => onForward(ids)} title="Forward">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 17 20 12 15 7" />
            <path d="M4 18v-2a4 4 0 014-4h12" />
          </svg>
        </button>
        <button className="selection-bar-btn selection-bar-btn-delete" onClick={() => onDelete(ids)} title="Delete">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
