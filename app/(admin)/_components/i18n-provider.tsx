"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Messages = Record<string, any>;

interface I18nContextValue {
  locale: string;
  setLocale: (locale: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

/** Lazily loaded message catalogs. */
const catalogs: Record<string, Messages> = {};

async function loadCatalog(locale: string): Promise<Messages> {
  if (catalogs[locale]) return catalogs[locale];
  try {
    const mod = await import(`@/locales/${locale}.json`);
    catalogs[locale] = mod.default ?? mod;
  } catch {
    // Fallback to English if locale not found.
    if (locale !== "en") {
      const fallback = await import("@/locales/en.json");
      catalogs[locale] = fallback.default ?? fallback;
    } else {
      catalogs[locale] = {};
    }
  }
  return catalogs[locale];
}

export function I18nProvider({
  initialLocale,
  initialMessages,
  children,
}: {
  initialLocale: string;
  initialMessages: Messages;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [messages, setMessages] = useState<Messages>(initialMessages);

  const setLocale = useCallback(
    (newLocale: string) => {
      if (newLocale === locale) return;
      // Optimistically set locale; load catalog in background.
      setLocaleState(newLocale);
      void loadCatalog(newLocale).then((m) => setMessages(m));
    },
    [locale],
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let val = messages[key];
      if (val === undefined) {
        // Fallback: try English
        val = catalogs.en?.[key] ?? key;
      }
      if (typeof val !== "string") return key;
      if (!params) return val;
      return Object.entries(params).reduce(
        (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
        val,
      );
    },
    [messages],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

/** Convenience hook: just the translate function. */
export function useT() {
  return useContext(I18nContext).t;
}
