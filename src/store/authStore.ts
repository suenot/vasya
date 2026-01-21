import { create } from 'zustand';
import { UserInfo } from '../types/telegram';

interface AuthStore {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: UserInfo | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  setUser: (user) => set({
    user,
    isAuthenticated: user !== null,
    isLoading: false,
  }),

  setLoading: (loading) => set({ isLoading: loading }),

  logout: () => set({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  }),
}));
