import { create } from 'zustand';

export interface DownloadItemInfo {
  chatId: number;
  messageId: number;
  status: 'queued' | 'active' | 'done' | 'failed';
}

interface DownloadState {
  queued: number;
  active: number;
  completed: number;
  failed: number;
  activeItems: DownloadItemInfo[];
  queuedItems: DownloadItemInfo[];
  update: (stats: Partial<Omit<DownloadState, 'update'>>) => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  queued: 0,
  active: 0,
  completed: 0,
  failed: 0,
  activeItems: [],
  queuedItems: [],
  update: (stats) => set(stats),
}));
