import { create } from 'zustand';

interface SelectionState {
  selectedMessageIds: Set<number>;
  isSelectionMode: boolean;
  lastSelectedId: number | null;

  toggleMessage: (id: number) => void;
  selectMessage: (id: number) => void;
  deselectMessage: (id: number) => void;
  enterSelectionMode: (initialMessageId?: number) => void;
  exitSelectionMode: () => void;
  clearSelection: () => void;
  selectAll: (messageIds: number[]) => void;
  selectRange: (orderedIds: number[], fromId: number, toId: number) => void;
  setLastSelectedId: (id: number) => void;
  getSelectedCount: () => number;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedMessageIds: new Set<number>(),
  isSelectionMode: false,
  lastSelectedId: null,

  toggleMessage: (id) =>
    set((state) => {
      const next = new Set(state.selectedMessageIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedMessageIds: next, lastSelectedId: id };
    }),

  selectMessage: (id) =>
    set((state) => {
      const next = new Set(state.selectedMessageIds);
      next.add(id);
      return { selectedMessageIds: next, lastSelectedId: id };
    }),

  deselectMessage: (id) =>
    set((state) => {
      const next = new Set(state.selectedMessageIds);
      next.delete(id);
      return { selectedMessageIds: next };
    }),

  enterSelectionMode: (initialMessageId?) =>
    set(() => {
      const next = new Set<number>();
      if (initialMessageId !== undefined) {
        next.add(initialMessageId);
      }
      return {
        isSelectionMode: true,
        selectedMessageIds: next,
        lastSelectedId: initialMessageId ?? null,
      };
    }),

  exitSelectionMode: () =>
    set(() => ({
      isSelectionMode: false,
      selectedMessageIds: new Set<number>(),
      lastSelectedId: null,
    })),

  clearSelection: () =>
    set(() => ({
      selectedMessageIds: new Set<number>(),
    })),

  selectAll: (messageIds) =>
    set(() => ({
      selectedMessageIds: new Set(messageIds),
    })),

  selectRange: (orderedIds, fromId, toId) =>
    set((state) => {
      const fromIdx = orderedIds.indexOf(fromId);
      const toIdx = orderedIds.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1) return state;
      const start = Math.min(fromIdx, toIdx);
      const end = Math.max(fromIdx, toIdx);
      const next = new Set(state.selectedMessageIds);
      for (let i = start; i <= end; i++) {
        next.add(orderedIds[i]);
      }
      return { selectedMessageIds: next, lastSelectedId: toId };
    }),

  setLastSelectedId: (id) =>
    set(() => ({ lastSelectedId: id })),

  getSelectedCount: () => get().selectedMessageIds.size,
}));
