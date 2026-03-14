import { useState, useCallback, KeyboardEvent, ClipboardEvent, DragEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { readImage } from '@tauri-apps/plugin-clipboard-manager';
import { useMessagesStore } from '../../store/messagesStore';
import { Message } from '../../types/telegram';
import { useTranslation } from '../../i18n';
import './MessageInput.css';

interface MessageInputProps {
  accountId: string;
  chatId: number;
  topicId?: number;
  onMessageSent?: (message: Message) => void;
}

export const MessageInput = ({ accountId, chatId, topicId, onMessageSent }: MessageInputProps) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  const addOptimisticMessage = useMessagesStore((s) => s.addOptimisticMessage);
  const confirmOptimisticMessage = useMessagesStore((s) => s.confirmOptimisticMessage);
  const failOptimisticMessage = useMessagesStore((s) => s.failOptimisticMessage);

  const [dragOver, setDragOver] = useState(false);

  const clearMedia = useCallback(() => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  }, [mediaPreview]);

  /** Set media from a File object */
  const applyMediaFile = useCallback((file: File) => {
    clearMedia();
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  }, [clearMedia]);

  /** Convert RGBA pixel data to PNG Blob via OffscreenCanvas */
  const rgbaToPngBlob = useCallback(async (rgba: Uint8Array, width: number, height: number): Promise<Blob> => {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imageData, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  }, []);

  /** Try reading image from native Tauri clipboard */
  const tryNativeClipboard = useCallback(async () => {
    try {
      const img = await readImage();
      const { width, height } = await img.size();
      if (width === 0 || height === 0) return false;
      const rgba = await img.rgba();
      const blob = await rgbaToPngBlob(rgba, width, height);
      const file = new File([blob], `clipboard_${Date.now()}.png`, { type: 'image/png' });
      applyMediaFile(file);
      return true;
    } catch {
      return false;
    }
  }, [applyMediaFile, rgbaToPngBlob]);

  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    // Layer 1: standard clipboardData.items (works in Chromium-based webviews)
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            applyMediaFile(file);
            return;
          }
        }
      }
    }

    // Layer 2: clipboardData.files (some WebViews put images here instead)
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          e.preventDefault();
          applyMediaFile(files[i]);
          return;
        }
      }
    }

    // Layer 3: native Tauri clipboard API (reads system clipboard directly)
    const found = await tryNativeClipboard();
    if (found) {
      e.preventDefault();
    }
  }, [applyMediaFile, tryNativeClipboard]);

  /** Handle drag-and-drop files */
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      applyMediaFile(files[0]);
    }
  }, [applyMediaFile]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmedText = text.trim();
    if ((!trimmedText && !mediaFile) || sending) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // In a real app we'd show a thumbnail for media too
    addOptimisticMessage(chatId, tempId, trimmedText);
    setText('');
    const currentMedia = mediaFile;
    clearMedia();
    setSending(true);

    try {
      let sentMessage: Message;
      if (currentMedia) {
        // Read file as ArrayBuffer and send as bytes
        const buffer = await currentMedia.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));

        sentMessage = await invoke<Message>('send_media', {
          accountId,
          chatId,
          mediaBytes: bytes,
          fileName: currentMedia.name,
          mimeType: currentMedia.type,
          caption: trimmedText || undefined,
        });
      } else {
        sentMessage = await invoke<Message>('send_message', {
          accountId,
          chatId,
          text: trimmedText,
          topicId,
        });
      }

      confirmOptimisticMessage(chatId, tempId, sentMessage);
      onMessageSent?.(sentMessage);
    } catch (error) {
      console.error('[MessageInput] Failed to send:', error);
      failOptimisticMessage(chatId, tempId);
    } finally {
      setSending(false);
    }
  }, [text, sending, mediaFile, accountId, chatId, addOptimisticMessage, confirmOptimisticMessage, failOptimisticMessage, onMessageSent, clearMedia]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div
      className={`message-input-wrapper${dragOver ? ' drag-over' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {dragOver && (
        <div className="drop-overlay">{t('drop_to_attach')}</div>
      )}
      {mediaPreview && (
        <div className="media-preview-container">
          <div className="media-preview-item">
            {mediaFile?.type.startsWith('image/') ? (
              <img src={mediaPreview} alt="Paste preview" />
            ) : (
              <div className="file-preview">
                <span className="file-icon">📎</span>
                <span className="file-name">{mediaFile?.name}</span>
              </div>
            )}
            <button className="remove-media" onClick={clearMedia} title="Remove media">×</button>
          </div>
        </div>
      )}
      <div className="message-input-container">
        <textarea
          className="message-input"
          placeholder={mediaPreview ? t('add_caption') : t('write_message')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={sending}
          rows={1}
          autoFocus
        />
        <button
          className="send-button"
          onClick={handleSend}
          disabled={(!text.trim() && !mediaFile) || sending}
          title={t('send_enter')}
        >
          {sending ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};
