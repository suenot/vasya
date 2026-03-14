import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type HotkeyCategory = 'navigation' | 'search' | 'chat' | 'folders' | 'messages';

export interface HotkeyConfig {
    id: string;
    label: string;
    keys: string[]; // e.g. ['Meta', 'k']
    description: string;
    category: HotkeyCategory;
    /** If true, this hotkey is handled inline and cannot be customized */
    readonly?: boolean;
}

export const DEFAULT_HOTKEYS: HotkeyConfig[] = [
    // Search
    { id: 'focus_search', label: 'hotkey_focus_search', keys: ['Meta', 'k'], description: 'hotkey_focus_search_desc', category: 'search' },
    { id: 'search_in_chat', label: 'hotkey_search_in_chat', keys: ['Meta', 'f'], description: 'hotkey_search_in_chat_desc', category: 'search' },
    { id: 'close_search', label: 'hotkey_close_search', keys: ['Escape'], description: 'hotkey_close_search_desc', category: 'search', readonly: true },

    // Navigation
    { id: 'next_chat', label: 'hotkey_next_chat', keys: ['Alt', 'ArrowDown'], description: 'hotkey_next_chat_desc', category: 'navigation' },
    { id: 'prev_chat', label: 'hotkey_prev_chat', keys: ['Alt', 'ArrowUp'], description: 'hotkey_prev_chat_desc', category: 'navigation' },
    { id: 'next_chat_tab', label: 'hotkey_next_chat_tab', keys: ['Ctrl', 'Tab'], description: 'hotkey_next_chat_tab_desc', category: 'navigation' },
    { id: 'prev_chat_tab', label: 'hotkey_prev_chat_tab', keys: ['Ctrl', 'Shift', 'Tab'], description: 'hotkey_prev_chat_tab_desc', category: 'navigation' },
    { id: 'next_unread_chat', label: 'hotkey_next_unread_chat', keys: ['Alt', 'Shift', 'ArrowDown'], description: 'hotkey_next_unread_chat_desc', category: 'navigation' },
    { id: 'prev_unread_chat', label: 'hotkey_prev_unread_chat', keys: ['Alt', 'Shift', 'ArrowUp'], description: 'hotkey_prev_unread_chat_desc', category: 'navigation' },
    { id: 'close_chat', label: 'hotkey_close_chat', keys: ['Escape'], description: 'hotkey_close_chat_desc', category: 'navigation' },
    { id: 'close_panel', label: 'hotkey_close_panel', keys: ['Ctrl', 'w'], description: 'hotkey_close_panel_desc', category: 'navigation' },

    // Chat
    { id: 'open_settings', label: 'hotkey_open_settings', keys: ['Meta', ','], description: 'hotkey_open_settings_desc', category: 'chat' },
    { id: 'mute_chat', label: 'hotkey_mute_chat', keys: ['Ctrl', 'Shift', 'm'], description: 'hotkey_mute_chat_desc', category: 'chat' },

    // Folders
    { id: 'folder_1', label: 'hotkey_folder_1', keys: ['Ctrl', '1'], description: 'hotkey_folder_n_desc', category: 'folders' },
    { id: 'folder_2', label: 'hotkey_folder_2', keys: ['Ctrl', '2'], description: 'hotkey_folder_n_desc', category: 'folders' },
    { id: 'folder_3', label: 'hotkey_folder_3', keys: ['Ctrl', '3'], description: 'hotkey_folder_n_desc', category: 'folders' },
    { id: 'folder_4', label: 'hotkey_folder_4', keys: ['Ctrl', '4'], description: 'hotkey_folder_n_desc', category: 'folders' },
    { id: 'folder_5', label: 'hotkey_folder_5', keys: ['Ctrl', '5'], description: 'hotkey_folder_n_desc', category: 'folders' },
    { id: 'folder_6', label: 'hotkey_folder_6', keys: ['Ctrl', '6'], description: 'hotkey_folder_n_desc', category: 'folders' },
    { id: 'folder_7', label: 'hotkey_folder_7', keys: ['Ctrl', '7'], description: 'hotkey_folder_n_desc', category: 'folders' },
    { id: 'folder_8', label: 'hotkey_folder_8', keys: ['Ctrl', '8'], description: 'hotkey_folder_n_desc', category: 'folders' },
    { id: 'folder_9', label: 'hotkey_folder_9', keys: ['Ctrl', '9'], description: 'hotkey_folder_n_desc', category: 'folders' },

    // Messages
    { id: 'scroll_page_up', label: 'hotkey_scroll_page_up', keys: ['PageUp'], description: 'hotkey_scroll_page_up_desc', category: 'messages', readonly: true },
    { id: 'scroll_page_down', label: 'hotkey_scroll_page_down', keys: ['PageDown'], description: 'hotkey_scroll_page_down_desc', category: 'messages', readonly: true },
    { id: 'scroll_to_top', label: 'hotkey_scroll_to_top', keys: ['Ctrl', 'Home'], description: 'hotkey_scroll_to_top_desc', category: 'messages' },
    { id: 'scroll_to_bottom', label: 'hotkey_scroll_to_bottom', keys: ['Ctrl', 'End'], description: 'hotkey_scroll_to_bottom_desc', category: 'messages' },
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
            version: 2,
            migrate: (_persisted: unknown, _version: number) => {
                // On version bump, reset to new defaults (user customizations on old hotkeys are lost,
                // but new hotkeys are added and stale ones removed).
                return { hotkeys: DEFAULT_HOTKEYS };
            },
        }
    )
);
