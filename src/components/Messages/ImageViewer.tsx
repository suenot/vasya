import { useEffect, useRef, useState, useCallback } from 'react';
import './ImageViewer.css';

interface ImageViewerProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export const ImageViewer = ({ src, alt, onClose }: ImageViewerProps) => {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Zoom with wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(prev => {
      const next = Math.min(Math.max(prev + delta, 0.5), 5);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Double-click to toggle zoom
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  }, [scale]);

  // Drag to pan when zoomed
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (scale <= 1) return;
    e.stopPropagation();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [scale, translate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTranslate({
      x: translateStart.current.x + dx,
      y: translateStart.current.y + dy,
    });
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Click overlay (outside image) to close
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      handleClose();
    }
  }, [handleClose]);

  return (
    <div
      ref={overlayRef}
      className={`image-viewer-overlay${closing ? ' image-viewer-closing' : ''}`}
      onClick={handleOverlayClick}
    >
      <button className="image-viewer-close" onClick={handleClose} aria-label="Close">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <img
        className="image-viewer-img"
        src={src}
        alt={alt || 'Image'}
        draggable={false}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
        }}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
};
