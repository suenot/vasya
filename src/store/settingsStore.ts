import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  apiId: string | null;
  apiHash: string | null;
  isConfigured: boolean;

  setApiCredentials: (apiId: string, apiHash: string) => void;
  clearApiCredentials: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      apiId: null,
      apiHash: null,
      isConfigured: false,

      setApiCredentials: (apiId, apiHash) => set({
        apiId,
        apiHash,
        isConfigured: true,
      }),

      clearApiCredentials: () => set({
        apiId: null,
        apiHash: null,
        isConfigured: false,
      }),
    }),
    {
      name: 'telegram-settings',
    }
  )
);
