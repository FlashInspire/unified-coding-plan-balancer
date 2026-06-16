import { prisma } from "@/lib/prisma";

export interface UserPreferences {
  language: string;
  theme: string;
  dateTimeFormat: string;
  use24Hour: boolean;
}

const DEFAULTS: UserPreferences = {
  language: "en",
  theme: "system",
  dateTimeFormat: "YYYY-MM-DD HH:mm:ss",
  use24Hour: true,
};

export const userPreferenceRepo = {
  async get(userId: string): Promise<UserPreferences> {
    const row = await prisma.userPreference.findUnique({
      where: { userId },
    });
    if (!row) return DEFAULTS;
    return {
      language: row.language || DEFAULTS.language,
      theme: row.theme || DEFAULTS.theme,
      dateTimeFormat: row.dateTimeFormat || DEFAULTS.dateTimeFormat,
      use24Hour: row.use24Hour ?? DEFAULTS.use24Hour,
    };
  },

  async set(
    userId: string,
    prefs: Partial<UserPreferences>,
  ): Promise<UserPreferences> {
    const data: Record<string, string | boolean> = {};
    if (prefs.language !== undefined) data.language = prefs.language;
    if (prefs.theme !== undefined) data.theme = prefs.theme;
    if (prefs.dateTimeFormat !== undefined)
      data.dateTimeFormat = prefs.dateTimeFormat;
    if (prefs.use24Hour !== undefined) data.use24Hour = prefs.use24Hour;

    const row = await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULTS, ...data },
      update: data,
    });
    return {
      language: row.language || DEFAULTS.language,
      theme: row.theme || DEFAULTS.theme,
      dateTimeFormat: row.dateTimeFormat || DEFAULTS.dateTimeFormat,
      use24Hour: row.use24Hour ?? DEFAULTS.use24Hour,
    };
  },
};
