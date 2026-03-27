import { type PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { IntlProvider } from "react-intl";
import enUS from "../../lang/en-US.json";

type Locale = "en-US" | "cs-CZ" | "de-DE" | "sk-SK";

const SUPPORTED_LOCALES: Locale[] = ["en-US", "cs-CZ", "de-DE", "sk-SK"];

function detectLocale(): Locale {
  const lang = navigator.language;
  const match = SUPPORTED_LOCALES.find((l) => lang === l || lang.startsWith(l.split("-")[0]));
  return match ?? "en-US";
}

async function loadMessages(locale: Locale): Promise<Record<string, string>> {
  switch (locale) {
    case "cs-CZ":
      return (await import("../../lang/cs-CZ.json")).default;
    case "de-DE":
      return (await import("../../lang/de-DE.json")).default;
    case "sk-SK":
      return (await import("../../lang/sk-SK.json")).default;
    default:
      return {};
  }
}

export function I18nProvider({ children }: PropsWithChildren) {
  const initialLocale = useMemo(() => detectLocale(), []);
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [messages, setMessages] = useState<Record<string, string>>(enUS);

  const setLocale = useCallback(async (newLocale: Locale) => {
    const loaded = await loadMessages(newLocale);
    setLocaleState(newLocale);
    setMessages({ ...enUS, ...loaded });
  }, []);

  useEffect(() => {
    if (initialLocale !== "en-US") {
      setLocale(initialLocale);
    }
  }, [initialLocale, setLocale]);

  return (
    <IntlProvider locale={locale} messages={messages} defaultLocale="en-US">
      {children}
    </IntlProvider>
  );
}
