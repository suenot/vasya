import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

export type StorageMode = 'local' | 'remote';

interface StorageModePayload {
  mode: 'Local';
} | {
  mode: 'Remote';
  url: string;
  api_key: string | null;
}

interface SettingsStore {
  apiId: string | null;
  apiHash: string | null;
  isConfigured: boolean;

  // Storage mode
  storageMode: StorageMode;
  backendUrl: string;
  // NOTE: API key is persisted to localStorage via zustand persist middleware.
  // This is acceptable for a desktop Tauri app (equivalent to storing in the app's data dir).
  backendApiKey: string;
  storageSwitching: boolean;
  storageError: string | null;

  setApiCredentials: (apiId: string, apiHash: string) => void;
  markConfigured: () => void;
  clearApiCredentials: () => void;

  setStorageMode: (mode: StorageMode, url?: string, apiKey?: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      apiId: null,
      apiHash: null,
      isConfigured: false,

      storageMode: 'local' as StorageMode,
      backendUrl: 'http://localhost:3000',
      backendApiKey: '',
      storageSwitching: false,
      storageError: null,

      setApiCredentials: (apiId, apiHash) => set({
        apiId,
        apiHash,
        isConfigured: true,
      }),

      markConfigured: () => set({
        isConfigured: true,
      }),

      clearApiCredentials: () => set({
        apiId: null,
        apiHash: null,
        isConfigured: false,
      }),

      setStorageMode: async (mode, url, apiKey) => {
        set({ storageSwitching: true, storageError: null });
        try {
          const payload: StorageModePayload = mode === 'local'
            ? { mode: 'Local' }
            : { mode: 'Remote', url: url || get().backendUrl, api_key: apiKey || get().backendApiKey || null };

          await invoke('set_storage_mode', { mode: payload });

          set({
            storageMode: mode,
            backendUrl: url || get().backendUrl,
            backendApiKey: apiKey !== undefined ? apiKey : get().backendApiKey,
            storageSwitching: false,
          });
        } catch (err) {
          set({
            storageSwitching: false,
            storageError: String(err),
          });
          throw err;
        }
      },
    }),
    {
      name: 'telegram-settings',
    }
  )
);
