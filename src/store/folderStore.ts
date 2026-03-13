import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatTypeFilter = 'contacts' | 'non_contacts' | 'groups' | 'channels' | 'bots';

export interface ChatFolder {
  id: string;
  name: string;
  includedChatTypes: ChatTypeFilter[];
  excludedChatTypes: ChatTypeFilter[];
  includedChatIds: number[];
  excludedChatIds: number[];
  order: number;
}

interface FolderStore {
  folders: ChatFolder[];
  addFolder: (folder: Omit<ChatFolder, 'id' | 'order'>) => void;
  updateFolder: (id: string, folder: Partial<ChatFolder>) => void;
  deleteFolder: (id: string) => void;
  reorderFolders: (newOrder: string[]) => void;
}

export const useFolderStore = create<FolderStore>()(
  persist(
    (set) => ({
      folders: [],
      addFolder: (folderData) =>
        set((state) => ({
          folders: [
            ...state.folders,
            {
              ...folderData,
              id: Math.random().toString(36).substring(2, 9),
              order: state.folders.length,
            },
          ],
        })),
      updateFolder: (id, updates) =>
        set((state) => ({
          folders: state.folders.map((f) => (f.id === id ? { ...f, ...updates } : f)),
        })),
      deleteFolder: (id) =>
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
        })),
      reorderFolders: (newOrderIds) =>
        set((state) => {
          const newFolders = [...state.folders].sort(
            (a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id)
          );
          // Update order field
          newFolders.forEach((f, i) => {
            f.order = i;
          });
          return { folders: newFolders };
        }),
    }),
    {
      name: 'telegram-folders',
    }
  )
);
