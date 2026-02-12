import { useState, useCallback, KeyboardEvent } from 'react';
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
  const addOptimisticMessage = useMessagesStore((s) => s.addOptimisticMessage);
  const confirmOptimisticMessage = useMessagesStore((s) => s.confirmOptimisticMessage);
  const failOptimisticMessage = useMessagesStore((s) => s.failOptimisticMessage);

  const handleSend = useCallback(async () => {
    const trimmedText = text.trim();
    if (!trimmedText || sending) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Optimistic: show message immediately
    addOptimisticMessage(chatId, tempId, trimmedText);
    setText('');
    setSending(true);

    try {
      const sentMessage = await invoke<Message>('send_message', {
        accountId,
        chatId,
        text: trimmedText,
      });

      // Replace optimistic message with real one
      confirmOptimisticMessage(chatId, tempId, sentMessage);
      onMessageSent?.(sentMessage);
    } catch (error) {
      console.error('[MessageInput] Failed to send:', error);
      failOptimisticMessage(chatId, tempId);
    } finally {
      setSending(false);
    }
  }, [text, sending, accountId, chatId, addOptimisticMessage, confirmOptimisticMessage, failOptimisticMessage, onMessageSent]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="message-input-container">
      <textarea
        className="message-input"
        placeholder="Write a message..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={sending}
        rows={1}
        autoFocus
      />
      <button
        className="send-button"
        onClick={handleSend}
        disabled={!text.trim() || sending}
        title="Send (Enter)"
      >
        {sending ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  );
};
