import { create } from 'zustand';
import { MediaInfo } from '../types/telegram';

export interface MessageBase {
  id: number;
  chat_id: number;
  from_user_id?: number;
  text?: string;
  date: number;
  is_outgoing: boolean;
  media?: MediaInfo[];
  // Optimistic update fields
  _optimistic?: boolean;
  _tempId?: string;
  _status?: 'sending' | 'sent' | 'failed';
}

interface MessagesState {
  messagesByChat: Record<number, MessageBase[]>;
  hasMoreByChat: Record<number, boolean>;

  setMessages: (chatId: number, messages: MessageBase[]) => void;
  prependMessages: (chatId: number, messages: MessageBase[]) => void;
  addMessage: (chatId: number, message: MessageBase) => void;
  updateMessage: (chatId: number, messageId: number, updates: Partial<MessageBase>) => void;
  removeMessage: (chatId: number, messageId: number) => void;

  // Optimistic updates
  addOptimisticMessage: (chatId: number, tempId: string, text: string) => void;
  confirmOptimisticMessage: (chatId: number, tempId: string, realMessage: MessageBase) => void;
  failOptimisticMessage: (chatId: number, tempId: string) => void;

  setHasMore: (chatId: number, hasMore: boolean) => void;
  clearChat: (chatId: number) => void;
}

export const useMessagesStore = create<MessagesState>((set) => ({
  messagesByChat: {},
  hasMoreByChat: {},

  setMessages: (chatId, messages) =>
    set((state) => ({
      messagesByChat: { ...state.messagesByChat, [chatId]: messages },
    })),

  prependMessages: (chatId, messages) =>
    set((state) => ({
      messagesByChat: {
        ...state.messagesByChat,
        [chatId]: [...messages, ...(state.messagesByChat[chatId] || [])],
      },
    })),

  addMessage: (chatId, message) =>
    set((state) => {
      const existing = state.messagesByChat[chatId] || [];
      // Deduplicate
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: [...existing, message],
        },
      };
    }),

  updateMessage: (chatId, messageId, updates) =>
    set((state) => {
      const messages = state.messagesByChat[chatId];
      if (!messages) return state;
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: messages.map((m) =>
            m.id === messageId ? { ...m, ...updates } : m
          ),
        },
      };
    }),

  removeMessage: (chatId, messageId) =>
    set((state) => {
      const messages = state.messagesByChat[chatId];
      if (!messages) return state;
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: messages.filter((m) => m.id !== messageId),
        },
      };
    }),

  addOptimisticMessage: (chatId, tempId, text) =>
    set((state) => {
      const existing = state.messagesByChat[chatId] || [];
      const optimistic: MessageBase = {
        id: -Date.now(), // Negative temp ID
        chat_id: chatId,
        text,
        date: Math.floor(Date.now() / 1000),
        is_outgoing: true,
        _optimistic: true,
        _tempId: tempId,
        _status: 'sending',
      };
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: [...existing, optimistic],
        },
      };
    }),

  confirmOptimisticMessage: (chatId, tempId, realMessage) =>
    set((state) => {
      const messages = state.messagesByChat[chatId];
      if (!messages) return state;
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: messages.map((m) =>
            m._tempId === tempId ? { ...realMessage, _status: 'sent' as const } : m
          ),
        },
      };
    }),

  failOptimisticMessage: (chatId, tempId) =>
    set((state) => {
      const messages = state.messagesByChat[chatId];
      if (!messages) return state;
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: messages.map((m) =>
            m._tempId === tempId ? { ...m, _status: 'failed' as const } : m
          ),
        },
      };
    }),

  setHasMore: (chatId, hasMore) =>
    set((state) => ({
      hasMoreByChat: { ...state.hasMoreByChat, [chatId]: hasMore },
    })),

  clearChat: (chatId) =>
    set((state) => {
      const { [chatId]: _, ...rest } = state.messagesByChat;
      return { messagesByChat: rest };
    }),
}));
