import { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import './AttachmentMenu.css';

interface AttachmentMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPhoto: () => void;
  onSelectDocument: () => void;
  onSelectCamera: () => void;
}

export const AttachmentMenu = ({
  isOpen,
  onClose,
  onSelectPhoto,
  onSelectDocument,
  onSelectCamera,
}: AttachmentMenuProps) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      // Delay adding listener to avoid catching the opening click
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, handleClickOutside]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="attachment-menu" ref={menuRef}>
      <button className="attachment-menu-item" onClick={onSelectPhoto}>
        <span className="attachment-menu-icon attachment-icon-photo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </span>
        <span className="attachment-menu-label">{t('attach_photo')}</span>
      </button>
      <button className="attachment-menu-item" onClick={onSelectDocument}>
        <span className="attachment-menu-icon attachment-icon-document">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </span>
        <span className="attachment-menu-label">{t('attach_document')}</span>
      </button>
      <button className="attachment-menu-item" onClick={onSelectCamera}>
        <span className="attachment-menu-icon attachment-icon-camera">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
        <span className="attachment-menu-label">{t('attach_camera')}</span>
      </button>
    </div>
  );
};
