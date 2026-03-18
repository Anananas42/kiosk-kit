import { createContext, useContext, useMemo } from 'react';
import cs from './cs.json';
import en from './en.json';

const locales: Record<string, Record<string, string>> = { cs, en };

type TFunction = (key: string, params?: Record<string, string | number>) => string;

const I18nContext = createContext<TFunction>((k) => k);

export function I18nProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  const t = useMemo<TFunction>(() => {
    const strings = locales[locale] ?? locales.en!;
    return (key, params) => {
      let s = strings[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    };
  }, [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT() { return useContext(I18nContext); }
