import { useState, useCallback, KeyboardEvent, ClipboardEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useMessagesStore } from '../../store/messagesStore';
import { Message } from '../../types/telegram';
import './MessageInput.css';

interface MessageInputProps {
  accountId: string;
  chatId: number;
  onMessageSent?: (message: Message) => void;
}

export const MessageInput = ({ accountId, chatId, onMessageSent }: MessageInputProps) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  const addOptimisticMessage = useMessagesStore((s) => s.addOptimisticMessage);
  const confirmOptimisticMessage = useMessagesStore((s) => s.confirmOptimisticMessage);
  const failOptimisticMessage = useMessagesStore((s) => s.failOptimisticMessage);

  const clearMedia = useCallback(() => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  }, [mediaPreview]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          clearMedia();
          setMediaFile(file);
          setMediaPreview(URL.createObjectURL(file));
          break;
        }
      }
    }
  }, [clearMedia]);

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
    <div className="message-input-wrapper">
      {mediaPreview && (
        <div className="media-preview-container">
          <div className="media-preview-item">
            <img src={mediaPreview} alt="Paste preview" />
            <button className="remove-media" onClick={clearMedia} title="Remove media">×</button>
          </div>
        </div>
      )}
      <div className="message-input-container">
        <textarea
          className="message-input"
          placeholder={mediaPreview ? "Add a caption..." : "Write a message..."}
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
          title="Send (Enter)"
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
