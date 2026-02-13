import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface HotkeyConfig {
    id: string;
    label: string;
    keys: string[]; // e.g. ['Meta', 'k']
    description: string;
}

export const DEFAULT_HOTKEYS: HotkeyConfig[] = [
    { id: 'focus_search', label: 'Search', keys: ['Meta', 'k'], description: 'Focus search bar' },
    { id: 'open_settings', label: 'Settings', keys: ['Meta', ','], description: 'Open settings' },
    { id: 'close_chat', label: 'Close Chat/Esc', keys: ['Escape'], description: 'Close active chat or modal' },
    { id: 'next_chat', label: 'Next Chat', keys: ['Alt', 'ArrowDown'], description: 'Switch to next chat' },
    { id: 'prev_chat', label: 'Previous Chat', keys: ['Alt', 'ArrowUp'], description: 'Switch to previous chat' },
];

interface HotkeysState {
    hotkeys: HotkeyConfig[];
    updateHotkey: (id: string, keys: string[]) => void;
    resetDefaults: () => void;
    getHotkey: (id: string) => string[];
}

export const useHotkeysStore = create<HotkeysState>()(
    persist(
        (set, get) => ({
            hotkeys: DEFAULT_HOTKEYS,
            updateHotkey: (id, keys) =>
                set((state) => ({
                    hotkeys: state.hotkeys.map((h) => (h.id === id ? { ...h, keys } : h)),
                })),
            resetDefaults: () => set({ hotkeys: DEFAULT_HOTKEYS }),
            getHotkey: (id) => get().hotkeys.find((h) => h.id === id)?.keys || [],
        }),
        {
            name: 'vasyapp-hotkeys',
        }
    )
);
