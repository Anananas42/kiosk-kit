import { useMemo } from "react";
import { I18nContext, type TFunction } from "./context.js";
import cs from "./cs.json";
import en from "./en.json";

export { useT } from "./useT.js";

const locales: Record<string, Record<string, string>> = { cs, en };

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
