"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { I18nProvider } from "./i18n-provider";
import { ThemeProvider } from "./theme-provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Messages = Record<string, any>;

/**
 * Client wrapper that loads the user's language/theme preferences from the
 * session and initializes the i18n + theme providers accordingly.
 */
export function AdminProviders({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const locale = (session?.user as { language?: string })?.language ?? "en";
  const theme =
    (session?.user as { theme?: string })?.theme ?? "system";

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
        {children}
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider initialTheme={theme as "light" | "dark" | "system"}>
      <I18nProvider initialLocale={locale} initialMessages={messages}>
        {children}
      </I18nProvider>
    </ThemeProvider>
  );
}
