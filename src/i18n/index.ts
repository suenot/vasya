import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en, TranslationKey } from './locales/en';
import { ru } from './locales/ru';

export type Language = 'en' | 'ru';

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ru: 'Русский',
};

const translations: Record<Language, Record<TranslationKey, string>> = {
  en,
  ru,
};

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (language) => set({ language }),
    }),
    { name: 'app-language' }
  )
);

export function useTranslation() {
  const language = useLanguageStore((s) => s.language);
  const t = translations[language];

  return {
    t: (key: TranslationKey, params?: Record<string, string>) => {
      let value = t[key] || en[key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(`{${k}}`, v);
        }
      }
      return value;
    },
    language,
  };
}

export type { TranslationKey };
