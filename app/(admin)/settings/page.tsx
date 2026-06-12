"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../_components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

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
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Tabs defaultValue="profile">
        <TabsList variant="line">
          <TabsTrigger value="profile">User Profile</TabsTrigger>
          <TabsTrigger value="system">System Settings</TabsTrigger>
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
// Tab 1: User Profile — change password
// ---------------------------------------------------------------------------
function UserProfileCard() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
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
        <CardTitle className="text-sm">Change Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">
              Current Password
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
              New Password
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
              Confirm New Password
            </label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              Password changed successfully.
            </div>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Change Password"}
          </Button>
        </form>
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
