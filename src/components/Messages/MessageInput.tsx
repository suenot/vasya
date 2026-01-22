import { useState, KeyboardEvent } from 'react';
import { useTauriCommand } from '../../hooks/useTauriCommand';
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

  const sendMessage = useTauriCommand<Message, {
    accountId: string;
    chatId: number;
    text: string;
  }>('send_message');

  const handleSend = async () => {
    const trimmedText = text.trim();
    if (!trimmedText || sending) return;

    try {
      setSending(true);
      console.log('[MessageInput] Sending message:', trimmedText);

      const sentMessage = await sendMessage({
        accountId,
        chatId,
        text: trimmedText,
      });

      console.log('[MessageInput] ✓ Message sent successfully:', sentMessage);
      setText(''); // Очищаем поле после отправки

      // Уведомляем родительский компонент о новом сообщении
      if (onMessageSent) {
        onMessageSent(sentMessage);
      }
    } catch (error) {
      console.error('[MessageInput] ✗ Failed to send message:', error);
      // TODO: Показать уведомление об ошибке
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Отправка по Enter (без Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
