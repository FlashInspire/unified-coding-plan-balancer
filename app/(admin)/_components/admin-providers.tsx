"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { I18nProvider } from "./i18n-provider";
import { ThemeProvider } from "./theme-provider";
import { DateTimeFormatProvider } from "./datetime-format-provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Messages = Record<string, any>;

const LS_LANG = "ucpb:lang";
const LS_THEME = "ucpb:theme";

/**
 * Client wrapper that loads the user's language/theme preferences from the
 * session and initializes the i18n + theme providers accordingly.
 *
 * Preferences are cached in localStorage so they survive the initial render
 * flash before the session JWT is loaded. The session always takes precedence
 * once available.
 */
export function AdminProviders({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const sessionLang = (session?.user as { language?: string })?.language;
  const sessionTheme = (session?.user as { theme?: string })?.theme;
  const sessionDateTimeFormat = (session?.user as { dateTimeFormat?: string })?.dateTimeFormat;
  const sessionUse24Hour = (session?.user as { use24Hour?: boolean })?.use24Hour;

  // Resolve: session > localStorage > default
  const locale =
    sessionLang ??
    (typeof window !== "undefined" ? localStorage.getItem(LS_LANG) : null) ??
    "en";
  const theme =
    sessionTheme ??
    (typeof window !== "undefined" ? localStorage.getItem(LS_THEME) : null) ??
    "system";

  const dateTimeFormat = sessionDateTimeFormat ?? "YYYY-MM-DD HH:mm:ss";
  const use24Hour = sessionUse24Hour ?? true;

  // Persist to localStorage whenever session provides a value.
  useEffect(() => {
    if (sessionLang) localStorage.setItem(LS_LANG, sessionLang);
    if (sessionTheme) localStorage.setItem(LS_THEME, sessionTheme);
  }, [sessionLang, sessionTheme]);

  const [messages, setMessages] = useState<Messages>({});
  const [ready, setReady] = useState(false);

  // Load the message catalog for the current locale.
  useEffect(() => {
    let cancelled = false;
    void import(`@/locales/${locale}.json`)
      .then((mod) => {
        if (!cancelled) {
          setMessages(mod.default ?? mod);
          setReady(true);
        }
      })
      .catch(() => {
        // Fallback to English.
        void import("@/locales/en.json").then((mod) => {
          if (!cancelled) {
            setMessages(mod.default ?? mod);
            setReady(true);
          }
        });
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!ready) {
    // Render children immediately to avoid blank screen; i18n keys will
    // show as raw keys briefly, which is acceptable on first load.
    return (
      <ThemeProvider initialTheme={theme as "light" | "dark" | "system"}>
        <DateTimeFormatProvider dateTimeFormat={dateTimeFormat} use24Hour={use24Hour}>
          {children}
        </DateTimeFormatProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider initialTheme={theme as "light" | "dark" | "system"}>
      <DateTimeFormatProvider dateTimeFormat={dateTimeFormat} use24Hour={use24Hour}>
        <I18nProvider initialLocale={locale} initialMessages={messages}>
          {children}
        </I18nProvider>
      </DateTimeFormatProvider>
    </ThemeProvider>
  );
}
