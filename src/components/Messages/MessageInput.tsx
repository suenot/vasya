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
  const { addOptimisticMessage, confirmOptimisticMessage, failOptimisticMessage } = useMessagesStore();

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
        placeholder="Написать сообщение..."
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
        title="Отправить (Enter)"
      >
        {sending ? '⏳' : '📤'}
      </button>
    </div>
  );
};
