import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';

interface ThemeState {
  // Настройка темы (что выбрал пользователь)
  themeSetting: ThemeSetting;

  // Фактическая тема (с учетом system)
  effectiveTheme: ThemeMode;

  // Действия
  setThemeSetting: (setting: ThemeSetting) => void;
  setEffectiveTheme: (theme: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeSetting: 'system',
      effectiveTheme: 'light',

      setThemeSetting: (setting) => set({ themeSetting: setting }),
      setEffectiveTheme: (theme) => set({ effectiveTheme: theme }),
    }),
    {
      name: 'telegram-theme-storage',
      // Сохраняем только настройку, эффективную тему вычисляем при загрузке
      partialize: (state) => ({ themeSetting: state.themeSetting }),
    }
  )
);
