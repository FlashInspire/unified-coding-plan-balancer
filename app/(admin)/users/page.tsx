"use client";

import { useEffect, useState } from "react";
import { DataTable } from "../_components/data-table";
import { FormDialog } from "../_components/form-dialog";
import { apiFetch } from "../_components/api";

interface UserRow {
  id: string;
  username: string;
  createdAt: string;
}

export default function UsersPage() {
  const [data, setData] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <h1 className="text-2xl font-bold">Users</h1>
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

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <DataTable
          idKey="id"
          data={data as unknown as Record<string, unknown>[]}
          columns={[
            { key: "username", label: "Username" },
            {
              key: "createdAt",
              label: "Created",
              render: (r) =>
                new Date(r.createdAt as string).toLocaleDateString(),
            },
          ]}
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
