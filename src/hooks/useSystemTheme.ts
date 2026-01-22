import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

/**
 * Хук для определения системной темы ОС
 * Отслеживает изменения prefers-color-scheme media query
 */
export const useSystemTheme = (): ThemeMode => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    // Инициализация темы при первом рендере
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    // Media query для отслеживания темной темы
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    // Обработчик изменения темы
    const handleChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light');
    };

    // Подписка на изменения
    mediaQuery.addEventListener('change', handleChange);

    // Очистка при размонтировании
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return theme;
};
