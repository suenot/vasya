import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useMediaQueue } from '../../hooks/useMediaQueue';
import { MediaInfo } from '../../types/telegram';

interface MediaAttachmentProps {
  media: MediaInfo;
  accountId: string;
  chatId: number;
  messageId: number;
  messageText?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const MediaAttachment = ({
  media,
  accountId,
  chatId,
  messageId,
  messageText,
}: MediaAttachmentProps) => {
  const [loading, setLoading] = useState(false);
  const [loadedMedia, setLoadedMedia] = useState<MediaInfo | null>(null);
  const downloadMedia = useMediaQueue();

  // Auto-download on mount (skip webpages)
  useEffect(() => {
    if (media.media_type === 'webpage') return;

    const needsDownload = !media.file_path || media.file_path.trim() === '';
    if (!needsDownload || loadedMedia || loading) return;

    let cancelled = false;

    const doDownload = async () => {
      try {
        setLoading(true);
        const result = await downloadMedia(accountId, chatId, messageId) as MediaInfo[] | null;
        if (!cancelled && result && result.length > 0) {
          setLoadedMedia(result[0]);
        }
      } catch {
        // Download failed — placeholder will show
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    doDownload();
    return () => { cancelled = true; };
  }, [media.file_path, media.media_type, accountId, chatId, messageId, loadedMedia, loading, downloadMedia]);

  const currentMedia = loadedMedia || media;

  // WebPage preview
  if (media.media_type === 'webpage') {
    const urlMatch = messageText?.match(/(https?:\/\/[^\s]+)/);
    const url = urlMatch ? urlMatch[1] : null;
    return (
      <div className="media-webpage">
        <div className="webpage-icon">🔗</div>
        <div className="webpage-content">
          <div className="webpage-title">Link Preview</div>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="webpage-url">
              {url.length > 50 ? url.substring(0, 50) + '...' : url}
            </a>
          )}
        </div>
      </div>
    );
  }

  // Placeholder while downloading
  if (!currentMedia.file_path || currentMedia.file_path.trim() === '') {
    return (
      <div className="media-placeholder">
        {loading ? (
          <div>⏳ Загружаем {media.media_type}...</div>
        ) : (
          <div>📎 {media.media_type} (не удалось загрузить)</div>
        )}
      </div>
    );
  }

  const fileSrc = convertFileSrc(currentMedia.file_path);

  switch (media.media_type) {
    case 'photo':
      return (
        <div className="media-photo">
          <img src={fileSrc} alt={currentMedia.file_name || 'Photo'} loading="lazy" style={{ maxWidth: '100%', borderRadius: '8px' }} />
        </div>
      );
    case 'video':
      return (
        <div className="media-video">
          <video src={fileSrc} controls style={{ maxWidth: '100%', borderRadius: '8px' }} />
        </div>
      );
    case 'audio':
    case 'voice':
      return (
        <div className="media-audio">
          <audio src={fileSrc} controls style={{ width: '100%' }} />
          {currentMedia.file_name && <div className="file-name">{currentMedia.file_name}</div>}
        </div>
      );
    case 'document':
      return (
        <div className="media-document">
          <a href={fileSrc} download={currentMedia.file_name} className="document-link">
            📄 {currentMedia.file_name || 'Документ'}
            {currentMedia.file_size && ` (${formatFileSize(currentMedia.file_size)})`}
          </a>
        </div>
      );
    case 'sticker':
      return (
        <div className="media-sticker">
          <img src={fileSrc} alt="Sticker" style={{ maxWidth: '200px', maxHeight: '200px' }} />
        </div>
      );
    default:
      return (
        <div className="media-other">
          <a href={fileSrc} download={currentMedia.file_name}>
            📎 {currentMedia.file_name || currentMedia.media_type}
          </a>
        </div>
      );
  }
};
