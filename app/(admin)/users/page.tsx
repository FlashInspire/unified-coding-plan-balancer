"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
import { useT } from "../_components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil } from "lucide-react";

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
  tokensUsed: number;
}

export default function UsersPage() {
  const t = useT();
  const [data, setData] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<UserRow | null>(null);

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
          fields={[
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
        fields={[
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
            name: "password",
            label: "New Password (leave blank to keep current)",
            type: "text" as const,
            placeholder: "••••••",
          },
          {
            name: "mustChangePassword",
            label: "Must Change Password",
            type: "boolean" as const,
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
                mustChangePassword: editRow.mustChangePassword,
                rollingQuota: editRow.rollingQuota ?? "",
                weekQuota: editRow.weekQuota ?? "",
                monthQuota: editRow.monthQuota ?? "",
              }
            : undefined
        }
        submitLabel="Save"
        onSubmit={async (v) => {
          setError(null);
          try {
            const body: Record<string, unknown> = {};
            if (v.password) body.password = v.password;
            if (v.mustChangePassword != null)
              body.mustChangePassword = v.mustChangePassword;
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
              className: "w-[110px]",
              render: (r) => {
                const row = r as unknown as UserRow;
                return row.mustChangePassword ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-amber-100 text-amber-800"
                  >
                    {t("users.status.mustChange")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    {t("users.status.active")}
                  </Badge>
                );
              },
            },
            {
              key: "quota",
              label: t("users.table.quota"),
              className: "w-[120px]",
              render: (r) => {
                const row = r as unknown as UserRow;
                const fmt = (n: number) =>
                  n >= 1_000_000
                    ? `${(n / 1_000_000).toFixed(1)}M`
                    : n >= 1_000
                      ? `${(n / 1_000).toFixed(1)}K`
                      : String(n);
                const parts: string[] = [];
                if (row.rollingQuota != null && row.rollingQuota > 0)
                  parts.push(`R: ${fmt(row.tokensUsed)}/${fmt(row.rollingQuota)}`);
                if (row.weekQuota != null && row.weekQuota > 0)
                  parts.push(`W: ${fmt(row.tokensUsed)}/${fmt(row.weekQuota)}`);
                if (row.monthQuota != null && row.monthQuota > 0)
                  parts.push(`M: ${fmt(row.tokensUsed)}/${fmt(row.monthQuota)}`);
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
