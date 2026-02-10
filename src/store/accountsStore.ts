import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserInfo } from '../types/telegram';

export interface Account {
  id: string;
  userInfo: UserInfo;
  isActive: boolean;
}

interface AccountsStore {
  accounts: Account[];
  activeAccountId: string | null;

  addAccount: (id: string, userInfo: UserInfo) => void;
  removeAccount: (id: string) => void;
  setActiveAccount: (id: string) => void;
  clearActiveAccount: () => void;
  getActiveAccount: () => Account | null;
  updateAccountInfo: (id: string, userInfo: UserInfo) => void;
}

export const useAccountsStore = create<AccountsStore>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountId: null,

      addAccount: (id, userInfo) => set((state) => {
        const existingAccount = state.accounts.find(acc => acc.id === id);

        if (existingAccount) {
          // Update existing account
          return {
            accounts: state.accounts.map(acc =>
              acc.id === id ? { ...acc, userInfo } : acc
            ),
          };
        }

        // Add new account and make it active
        return {
          accounts: [
            ...state.accounts.map(acc => ({ ...acc, isActive: false })),
            { id, userInfo, isActive: true },
          ],
          activeAccountId: id,
        };
      }),

      removeAccount: (id) => set((state) => {
        const newAccounts = state.accounts.filter(acc => acc.id !== id);
        const newActiveId = state.activeAccountId === id
          ? (newAccounts[0]?.id || null)
          : state.activeAccountId;

        return {
          accounts: newAccounts.map(acc => ({
            ...acc,
            isActive: acc.id === newActiveId,
          })),
          activeAccountId: newActiveId,
        };
      }),

      setActiveAccount: (id) => set((state) => ({
        accounts: state.accounts.map(acc => ({
          ...acc,
          isActive: acc.id === id,
        })),
        activeAccountId: id,
      })),

      clearActiveAccount: () => set((state) => ({
        accounts: state.accounts.map(acc => ({ ...acc, isActive: false })),
        activeAccountId: null,
      })),

      getActiveAccount: () => {
        const state = get();
        return state.accounts.find(acc => acc.id === state.activeAccountId) || null;
      },

      updateAccountInfo: (id, userInfo) => set((state) => ({
        accounts: state.accounts.map(acc =>
          acc.id === id ? { ...acc, userInfo } : acc
        ),
      })),
    }),
    {
      name: 'telegram-accounts',
    }
  )
);
