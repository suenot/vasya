import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Chat } from '../types/telegram';

interface ChatsStore {
  chatsByAccount: Record<string, Chat[]>;

  setChats: (accountId: string, chats: Chat[]) => void;
  getChats: (accountId: string) => Chat[] | undefined;
  updateUnreadCount: (accountId: string, chatId: number, unreadCount: number) => void;
  clearChats: (accountId: string) => void;
}

export const useChatsStore = create<ChatsStore>()(
  persist(
    (set, get) => ({
      chatsByAccount: {},
      
      setChats: (accountId, chats) => {
        set((state) => ({
          chatsByAccount: {
            ...state.chatsByAccount,
            [accountId]: chats,
          },
        }));
      },
      
      getChats: (accountId) => {
        return get().chatsByAccount[accountId];
      },

      updateUnreadCount: (accountId, chatId, unreadCount) => {
        set((state) => {
          const chats = state.chatsByAccount[accountId];
          if (!chats) return state;
          return {
            chatsByAccount: {
              ...state.chatsByAccount,
              [accountId]: chats.map((c) =>
                c.id === chatId ? { ...c, unreadCount } : c
              ),
            },
          };
        });
      },
      
      clearChats: (accountId) => {
        set((state) => {
          const { [accountId]: _, ...rest } = state.chatsByAccount;
          return { chatsByAccount: rest };
        });
      },
    }),
    {
      name: 'chats-storage',
    }
  )
);
