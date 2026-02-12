import { create } from 'zustand';

interface MuteState {
  mutedChats: Set<number>;
  isMuted: (chatId: number) => boolean;
  toggleMute: (chatId: number) => void;
}

export const useMuteStore = create<MuteState>((set, get) => {
  const saved = localStorage.getItem('mutedChats');
  const initial: Set<number> = saved ? new Set(JSON.parse(saved)) : new Set();

  return {
    mutedChats: initial,
    isMuted: (chatId: number) => get().mutedChats.has(chatId),
    toggleMute: (chatId: number) => {
      set((state) => {
        const next = new Set(state.mutedChats);
        if (next.has(chatId)) {
          next.delete(chatId);
        } else {
          next.add(chatId);
        }
        localStorage.setItem('mutedChats', JSON.stringify([...next]));
        return { mutedChats: next };
      });
    },
  };
});
