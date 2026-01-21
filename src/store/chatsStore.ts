import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Chat } from '../types/telegram';

interface ChatsStore {
  chatsByAccount: Record<string, Chat[]>;
  
  setChats: (accountId: string, chats: Chat[]) => void;
  getChats: (accountId: string) => Chat[] | undefined;
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
