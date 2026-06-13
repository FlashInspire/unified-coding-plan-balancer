import { prisma } from "@/lib/prisma";

export interface UserPreferences {
  language: string;
  theme: string;
}

const DEFAULTS: UserPreferences = {
  language: "en",
  theme: "system",
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
    };
  },

  async set(
    userId: string,
    prefs: Partial<UserPreferences>,
  ): Promise<UserPreferences> {
    const data: Record<string, string> = {};
    if (prefs.language !== undefined) data.language = prefs.language;
    if (prefs.theme !== undefined) data.theme = prefs.theme;

    const row = await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULTS, ...data },
      update: data,
    });
    return {
      language: row.language || DEFAULTS.language,
      theme: row.theme || DEFAULTS.theme,
    };
  },
};
