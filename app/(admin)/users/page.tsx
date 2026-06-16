"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
import { useT } from "../_components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, KeyRound } from "lucide-react";

interface UserRow {
  id: string;
  username: string;
  role: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  mustChangePassword: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  rollingQuota: number | null;
  weekQuota: number | null;
  monthQuota: number | null;
  rollingInputTokensUsed: number;
  rollingCachedReadTokensUsed: number;
  rollingOutputTokensUsed: number;
  weekInputTokensUsed: number;
  weekCachedReadTokensUsed: number;
  weekOutputTokensUsed: number;
  monthInputTokensUsed: number;
  monthCachedReadTokensUsed: number;
  monthOutputTokensUsed: number;
  quotaMultiplierInput: number;
  quotaMultiplierCachedRead: number;
  quotaMultiplierOutput: number;
}

export default function UsersPage() {
  const t = useT();
  const [data, setData] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<UserRow | null>(null);
  const [passwordRow, setPasswordRow] = useState<UserRow | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<{ data: UserRow[] }>("/api/admin/users");
      setData(r.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">{t("page.users.title")}</h1>
        <FormDialog
          title={t("users.dialog.addTitle")}
          triggerLabel={t("users.dialog.addTrigger")}
          wide
          fields={[
            {
              type: "section" as const,
              legend: t("users.section.basic"),
            },
            {
              name: "username",
              label: t("users.form.username"),
              type: "text" as const,
              required: true,
            },
            {
              name: "password",
              label: t("users.form.password"),
              type: "text" as const,
              required: true,
            },
            {
              name: "role",
              label: t("users.form.role"),
              type: "select" as const,
              options: [
                { value: "user", label: t("users.role.user") },
                { value: "admin", label: t("users.role.admin") },
              ],
            },
            {
              name: "displayName",
              label: t("users.form.displayName"),
              type: "text" as const,
            },
            {
              name: "email",
              label: t("users.form.email"),
              type: "text" as const,
            },
            {
              name: "avatarUrl",
              label: t("users.form.avatarUrl"),
              type: "text" as const,
            },
          ]}
          onSubmit={async (v) => {
            setError(null);
            try {
              await apiFetch("/api/admin/users", {
                method: "POST",
                body: JSON.stringify(v),
              });
              await load();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Failed to create user",
              );
            }
          }}
        />
      </div>

      {/* Edit modal */}
      <FormDialog
        title={`${t("users.dialog.editTitle")}: ${editRow?.username ?? ""}`}
        wide
        fields={[
          {
            type: "section" as const,
            legend: t("users.section.basic"),
          },
          {
            name: "username",
            label: "Username",
            type: "text" as const,
            readOnly: true,
          },
          {
            name: "role",
            label: t("users.form.role"),
            type: "select" as const,
            options: [
              { value: "user", label: t("users.role.user") },
              { value: "admin", label: t("users.role.admin") },
            ],
          },
          {
            name: "displayName",
            label: t("users.form.displayName"),
            type: "text" as const,
          },
          {
            name: "email",
            label: t("users.form.email"),
            type: "text" as const,
          },
          {
            name: "avatarUrl",
            label: t("users.form.avatarUrl"),
            type: "text" as const,
          },
          {
            type: "section" as const,
            legend: t("users.section.quotaBilling"),
          },
          {
            name: "rollingQuota",
            label: t("users.form.rollingQuota"),
            type: "number" as const,
            placeholder: "0 = unlimited",
          },
          {
            name: "weekQuota",
            label: t("users.form.weekQuota"),
            type: "number" as const,
            placeholder: "0 = unlimited",
          },
          {
            name: "monthQuota",
            label: t("users.form.monthQuota"),
            type: "number" as const,
            placeholder: "0 = unlimited",
          },
          {
            name: "quotaMultiplierInput",
            label: t("users.form.quotaMultiplierInput"),
            type: "number" as const,
            placeholder: "1.0",
          },
          {
            name: "quotaMultiplierCachedRead",
            label: t("users.form.quotaMultiplierCachedRead"),
            type: "number" as const,
            placeholder: "0.1",
          },
          {
            name: "quotaMultiplierOutput",
            label: t("users.form.quotaMultiplierOutput"),
            type: "number" as const,
            placeholder: "4.0",
          },
        ]}
        open={editRow != null}
        onOpenChange={(o) => {
          if (!o) setEditRow(null);
        }}
        initialValues={
          editRow
            ? {
                username: editRow.username,
                role: editRow.role,
                displayName: editRow.displayName ?? "",
                email: editRow.email ?? "",
                avatarUrl: editRow.avatarUrl ?? "",
                rollingQuota: editRow.rollingQuota ?? "",
                weekQuota: editRow.weekQuota ?? "",
                monthQuota: editRow.monthQuota ?? "",
                quotaMultiplierInput: editRow.quotaMultiplierInput,
                quotaMultiplierCachedRead: editRow.quotaMultiplierCachedRead,
                quotaMultiplierOutput: editRow.quotaMultiplierOutput,
              }
            : undefined
        }
        submitLabel="Save"
        onSubmit={async (v) => {
          setError(null);
          try {
            const body: Record<string, unknown> = {};
            if (v.role && v.role !== editRow!.role) body.role = v.role;
            if (v.displayName !== undefined)
              body.displayName = v.displayName || null;
            if (v.email !== undefined) body.email = v.email || null;
            if (v.avatarUrl !== undefined) body.avatarUrl = v.avatarUrl || null;
            if (v.rollingQuota !== undefined && v.rollingQuota !== "")
              body.rollingQuota = Number(v.rollingQuota);
            if (v.weekQuota !== undefined && v.weekQuota !== "")
              body.weekQuota = Number(v.weekQuota);
            if (v.monthQuota !== undefined && v.monthQuota !== "")
              body.monthQuota = Number(v.monthQuota);
            if (
              v.quotaMultiplierInput !== undefined &&
              v.quotaMultiplierInput !== ""
            )
              body.quotaMultiplierInput = Number(v.quotaMultiplierInput);
            if (
              v.quotaMultiplierCachedRead !== undefined &&
              v.quotaMultiplierCachedRead !== ""
            )
              body.quotaMultiplierCachedRead = Number(
                v.quotaMultiplierCachedRead,
              );
            if (
              v.quotaMultiplierOutput !== undefined &&
              v.quotaMultiplierOutput !== ""
            )
              body.quotaMultiplierOutput = Number(v.quotaMultiplierOutput);
            await apiFetch(`/api/admin/users/${editRow!.id}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            });
            setEditRow(null);
            await load();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Failed to update user",
            );
          }
        }}
      />

      {/* Change Password modal */}
      <FormDialog
        title={t("users.dialog.changePasswordTitle").replace(
          "{name}",
          passwordRow?.username ?? "",
        )}
        fields={[
          {
            name: "newPassword",
            label: t("users.form.password"),
            type: "text" as const,
            required: true,
            placeholder: "••••••",
          },
          {
            name: "confirmPassword",
            label: t("users.form.confirmPassword"),
            type: "text" as const,
            required: true,
            placeholder: "••••••",
          },
        ]}
        open={passwordRow != null}
        onOpenChange={(o) => {
          if (!o) {
            setPasswordRow(null);
            setPasswordError(null);
          }
        }}
        submitLabel={t("users.action.changePassword")}
        onSubmit={async (v) => {
          setPasswordError(null);
          const newPw = String(v.newPassword ?? "");
          const confirmPw = String(v.confirmPassword ?? "");
          if (newPw !== confirmPw) {
            throw new Error(t("users.password.mismatch"));
          }
          await apiFetch(`/api/admin/users/${passwordRow!.id}`, {
            method: "PATCH",
            body: JSON.stringify({ password: newPw }),
          });
          setPasswordRow(null);
          await load();
        }}
      />

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          idKey="id"
          tableClassName="table-fixed"
          data={data as unknown as Record<string, unknown>[]}
          columns={[
            {
              key: "username",
              label: t("users.table.username"),
              className: "w-[180px]",
              render: (r) => {
                const row = r as unknown as UserRow;
                const initial = (row.displayName ||
                  row.username ||
                  "?")[0].toUpperCase();
                return (
                  <div className="flex items-center gap-2">
                    {row.avatarUrl ? (
                      <img
                        src={row.avatarUrl}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                        {initial}
                      </span>
                    )}
                    <span className="truncate">{row.username}</span>
                  </div>
                );
              },
            },
            {
              key: "role",
              label: t("users.table.role"),
              className: "w-[90px]",
              render: (r) => {
                const row = r as unknown as UserRow;
                return row.role === "admin" ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-blue-100 text-blue-800"
                  >
                    {t("users.role.admin")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    {t("users.role.user")}
                  </Badge>
                );
              },
            },
            {
              key: "displayName",
              label: t("users.table.displayName"),
              className: "w-[120px]",
              render: (r) => {
                const row = r as unknown as UserRow;
                return (
                  <span className="text-xs text-muted-foreground truncate block">
                    {row.displayName || "—"}
                  </span>
                );
              },
            },
            {
              key: "email",
              label: t("users.table.email"),
              className: "w-[160px]",
              render: (r) => {
                const row = r as unknown as UserRow;
                return (
                  <span className="text-xs text-muted-foreground truncate block">
                    {row.email || "—"}
                  </span>
                );
              },
            },
            {
              key: "mustChangePassword",
              label: t("users.table.status"),
              className: "w-[140px]",
              render: (r) => {
                const row = r as unknown as UserRow;
                return (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      setError(null);
                      const newValue = !row.mustChangePassword;
                      // Optimistic update
                      setData((prev) =>
                        prev.map((u) =>
                          u.id === row.id
                            ? { ...u, mustChangePassword: newValue }
                            : u,
                        ),
                      );
                      try {
                        await apiFetch(`/api/admin/users/${row.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            mustChangePassword: newValue,
                          }),
                        });
                      } catch (err) {
                        // Rollback
                        setData((prev) =>
                          prev.map((u) =>
                            u.id === row.id
                              ? { ...u, mustChangePassword: !newValue }
                              : u,
                          ),
                        );
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Failed to update status",
                        );
                      }
                    }}
                    className="inline-flex"
                  >
                    {row.mustChangePassword ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-amber-100 text-amber-800 cursor-pointer hover:bg-amber-200"
                      >
                        {t("users.status.mustChange")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] cursor-pointer hover:bg-accent"
                      >
                        {t("users.status.active")}
                      </Badge>
                    )}
                  </button>
                );
              },
            },
            {
              key: "quota",
              label: t("users.table.quota"),
              className: "w-[160px]",
              render: (r) => {
                const row = r as unknown as UserRow;
                const fmt = (n: number) =>
                  n >= 1_000_000
                    ? `${(n / 1_000_000).toFixed(1)}M`
                    : n >= 1_000
                      ? `${(n / 1_000).toFixed(1)}K`
                      : String(n);
                const eff = (period: "rolling" | "week" | "month") => {
                  const input = row[
                    `${period}InputTokensUsed` as keyof UserRow
                  ] as number;
                  const cached = row[
                    `${period}CachedReadTokensUsed` as keyof UserRow
                  ] as number;
                  const output = row[
                    `${period}OutputTokensUsed` as keyof UserRow
                  ] as number;
                  return (
                    input * row.quotaMultiplierInput +
                    cached * row.quotaMultiplierCachedRead +
                    output * row.quotaMultiplierOutput
                  );
                };
                const parts: string[] = [];
                if (row.rollingQuota != null && row.rollingQuota > 0)
                  parts.push(
                    `H: ${fmt(eff("rolling"))}/${fmt(row.rollingQuota)}`,
                  );
                if (row.weekQuota != null && row.weekQuota > 0)
                  parts.push(`W: ${fmt(eff("week"))}/${fmt(row.weekQuota)}`);
                if (row.monthQuota != null && row.monthQuota > 0)
                  parts.push(`M: ${fmt(eff("month"))}/${fmt(row.monthQuota)}`);
                return (
                  <span className="text-xs text-muted-foreground">
                    {parts.length > 0 ? parts.join(" ") : "∞"}
                  </span>
                );
              },
            },
            {
              key: "lastSignInAt",
              label: t("users.table.lastLogin"),
              className: "w-[130px]",
              render: (r) => {
                const row = r as unknown as UserRow;
                return (
                  <span className="text-xs text-muted-foreground">
                    {row.lastSignInAt
                      ? new Date(row.lastSignInAt).toLocaleString()
                      : "—"}
                  </span>
                );
              },
            },
          ]}
          actions={(row) => {
            const u = row as unknown as UserRow;
            return (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditRow(u);
                  }}
                  className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-accent"
                  title="Edit"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPasswordRow(u);
                  }}
                  className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-accent"
                  title={t("users.action.changePassword")}
                >
                  <KeyRound className="h-3 w-3" />
                </button>
              </div>
            );
          }}
          onDelete={async (id) => {
            setError(null);
            try {
              await apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
              await load();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Failed to delete user",
              );
            }
          }}
        />
      )}
    </div>
  );
}
