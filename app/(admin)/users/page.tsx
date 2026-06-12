"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil } from "lucide-react";

interface UserRow {
  id: string;
  username: string;
  mustChangePassword: boolean;
  createdAt: string;
}

export default function UsersPage() {
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
        <h1 className="text-xl font-semibold">Users</h1>
        <FormDialog
          title="Add User"
          triggerLabel="+ Add User"
          fields={[
            {
              name: "username",
              label: "Username",
              type: "text" as const,
              required: true,
            },
            {
              name: "password",
              label: "Password",
              type: "text" as const,
              required: true,
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
        title={`Edit User: ${editRow?.username ?? ""}`}
        fields={[
          {
            name: "username",
            label: "Username",
            type: "text" as const,
            readOnly: true,
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
                mustChangePassword: editRow.mustChangePassword,
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
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
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
          data={data as unknown as Record<string, unknown>[]}
          columns={[
            { key: "username", label: "Username" },
            {
              key: "mustChangePassword",
              label: "Must Change Password",
              render: (r) => {
                const row = r as unknown as UserRow;
                return row.mustChangePassword ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-amber-100 text-amber-800"
                  >
                    Yes
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    No
                  </Badge>
                );
              },
            },
            {
              key: "createdAt",
              label: "Created",
              render: (r) =>
                new Date(r.createdAt as string).toLocaleDateString(),
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
