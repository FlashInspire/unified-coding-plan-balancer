"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "../_components/api";
import { useT, useI18n } from "../_components/i18n-provider";
import { useTheme } from "../_components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { signOut } from "next-auth/react";
import { LogOut, Lock, Sun, Moon, Monitor, Globe } from "lucide-react";

interface SettingEntry {
  value: string;
  source: "db" | "env";
}

const SETTING_LABELS: Record<string, string> = {
  LOG_RETENTION_DAYS: "Log Retention (days)",
  STAT_RETENTION_MONTHS: "Stat Retention (months)",
  QUOTA_REFRESH_INTERVAL_MS: "Quota Refresh Interval (ms)",
  QUOTA_REFRESH_CONCURRENCY: "Quota Refresh Concurrency",
  QUOTA_EXHAUST_THRESHOLD: "Quota Exhaust Threshold (%)",
  METRICS_FLUSH_INTERVAL_MS: "Metrics Flush Interval (ms)",
  METRICS_FLUSH_BATCH_SIZE: "Metrics Flush Batch Size",
  STICKY_TTL_MS: "Sticky Routing TTL (ms)",
};

export default function SettingsPage() {
  const t = useT();
  return (
    <div className="space-y-6">
      <h1 className="text-sm font-semibold">{t("page.settings.title")}</h1>
      <Tabs defaultValue="profile">
        <TabsList variant="line">
          <TabsTrigger value="profile">{t("settings.tabs.profile")}</TabsTrigger>
          <TabsTrigger value="system">{t("settings.tabs.system")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <UserProfileCard />
        </TabsContent>
        <TabsContent value="system">
          <SystemSettingsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: User Profile — profile info, preferences, change password, sign out
// ---------------------------------------------------------------------------
function UserProfileCard() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { update: updateSession } = useSession();
  const [profile, setProfile] = useState<{
    username: string;
    lastSignInAt: string | null;
    language: string;
    theme: string;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [pwOpen, setPwOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const r = await apiFetch<{
          data: {
            username: string;
            lastSignInAt: string | null;
            language: string;
            theme: string;
          };
        }>("/api/admin/me");
        setProfile(r.data);
      } finally {
        setProfileLoading(false);
      }
    });
  }, []);

  async function handlePreferenceChange(
    key: "language" | "theme",
    value: string,
  ) {
    try {
      await apiFetch("/api/admin/preferences", {
        method: "PATCH",
        body: JSON.stringify({ [key]: value }),
      });
      // Apply immediately.
      if (key === "language") {
        setLocale(value);
      } else {
        setTheme(value as "light" | "dark" | "system");
      }
      // Update session so JWT carries the new preference.
      await updateSession({ [key]: value });
      setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
    } catch {
      // Silently fail — preference is non-critical.
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirm) {
      setError(t("settings.profile.passwordMismatch"));
      return;
    }
    if (newPassword.length < 6) {
      setError(t("settings.profile.passwordTooShort"));
      return;
    }

    setLoading(true);
    try {
      await apiFetch("/api/admin/change-password", {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      setSuccess(true);
      setOldPassword("");
      setNewPassword("");
      setConfirm("");
      setTimeout(() => setPwOpen(false), 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-md mt-3">
      <CardHeader>
        <CardTitle className="text-sm">{t("settings.profile.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {profileLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : profile ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {t("settings.profile.username")}
              </span>
              <span className="text-xs font-medium">{profile.username}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {t("settings.profile.lastLogin")}
              </span>
              <span className="text-xs">
                {profile.lastSignInAt
                  ? new Date(profile.lastSignInAt).toLocaleString()
                  : "—"}
              </span>
            </div>
            <Separator />
          </div>
        ) : null}

        {/* Language preference */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            {t("settings.profile.language")}
          </span>
          <div className="flex gap-1">
            {(["en", "zh"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => handlePreferenceChange("language", lang)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  locale === lang
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {t(`settings.profile.language.${lang}`)}
              </button>
            ))}
          </div>
        </div>
        <Separator />

        {/* Theme preference */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            {theme === "dark" ? (
              <Moon className="h-3.5 w-3.5" />
            ) : theme === "light" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Monitor className="h-3.5 w-3.5" />
            )}
            {t("settings.profile.theme")}
          </span>
          <div className="flex gap-1">
            {(["light", "dark", "system"] as const).map((t_) => (
              <button
                key={t_}
                onClick={() => handlePreferenceChange("theme", t_)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  theme === t_
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {t(`settings.profile.theme.${t_}`)}
              </button>
            ))}
          </div>
        </div>
        <Separator />

        <Dialog open={pwOpen} onOpenChange={setPwOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <Lock className="h-3.5 w-3.5 mr-2" />
              {t("settings.profile.changePassword")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("settings.profile.changePassword")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">
                  {t("settings.profile.currentPassword")}
                </label>
                <Input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">
                  {t("settings.profile.newPassword")}
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">
                  {t("settings.profile.confirmPassword")}
                </label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                  {t("settings.profile.passwordChanged")}
                </div>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPwOpen(false)}
                >
                  {t("dialog.cancel")}
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving…" : t("dialog.save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Separator />

        <Button
          variant="outline"
          className="w-full"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-3.5 w-3.5 mr-2" />
          {t("settings.profile.signOut")}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: System Settings
// ---------------------------------------------------------------------------
function SystemSettingsCard() {
  const [settings, setSettings] = useState<Record<string, SettingEntry> | null>(
    null,
  );
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const r = await apiFetch<{ data: Record<string, SettingEntry> }>(
          "/api/admin/settings",
        );
        setSettings(r.data);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  function handleChange(key: string, value: string) {
    setEdits((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function handleSave() {
    if (Object.keys(edits).length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(edits),
      });
      const r = await apiFetch<{ data: Record<string, SettingEntry> }>(
        "/api/admin/settings",
      );
      setSettings(r.data);
      setEdits({});
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return <div className="text-muted-foreground text-sm mt-3">Loading…</div>;
  if (!settings)
    return (
      <div className="text-muted-foreground text-sm mt-3">
        Failed to load settings.
      </div>
    );

  const hasEdits = Object.keys(edits).length > 0;

  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle className="text-sm">System Settings</CardTitle>
        <p className="text-xs text-muted-foreground">
          Values sourced from{" "}
          <Badge variant="outline" className="text-[10px]">
            env
          </Badge>{" "}
          are defaults from environment variables. Overrides stored in{" "}
          <Badge variant="default" className="text-[10px]">
            db
          </Badge>{" "}
          take precedence.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(SETTING_LABELS).map(([key, label]) => {
          const entry = settings[key];
          const edited = edits[key];
          return (
            <div
              key={key}
              className="grid grid-cols-[200px_1fr_48px] items-center gap-2"
            >
              <label
                className="text-xs font-medium text-muted-foreground truncate"
                title={key}
              >
                {label}
              </label>
              <Input
                type="number"
                value={edited ?? entry?.value ?? ""}
                onChange={(e) => handleChange(key, e.target.value)}
                className="h-8 text-xs"
              />
              <Badge
                variant={entry?.source === "db" ? "default" : "outline"}
                className="text-[10px] justify-center"
              >
                {entry?.source ?? "—"}
              </Badge>
            </div>
          );
        })}
        {error && (
          <div className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm text-green-700 rounded-md bg-green-50 border border-green-200 px-3 py-2">
            Settings saved.
          </div>
        )}
        <Button onClick={handleSave} disabled={!hasEdits || saving}>
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
