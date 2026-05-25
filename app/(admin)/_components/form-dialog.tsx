"use client";

import { useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface FieldDef {
  name: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "json";
  options?: string[] | SelectOption[];
  required?: boolean;
  defaultValue?: string | number | boolean;
}

interface FormDialogProps {
  title: string;
  fields: FieldDef[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  triggerLabel?: string;
  /** If provided, the form opens in edit mode with these initial values. */
  initialValues?: Record<string, unknown>;
  /** Label for the submit button (defaults to "Create" or "Save" in edit mode). */
  submitLabel?: string;
  /** Controlled open state. When provided, the dialog is controlled externally. */
  open?: boolean;
  /** Callback when dialog should close (for controlled mode). */
  onOpenChange?: (open: boolean) => void;
}

export function FormDialog({
  title,
  fields,
  onSubmit,
  triggerLabel,
  initialValues,
  submitLabel,
  open: controlledOpen,
  onOpenChange,
}: FormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use controlled open if provided, otherwise internal state
  const isOpen = controlledOpen != null ? controlledOpen : internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = fd.get(f.name);
      if (raw == null || raw === "") continue;
      if (f.type === "number") values[f.name] = Number(raw);
      else if (f.type === "boolean") values[f.name] = raw === "on";
      else if (f.type === "json") {
        try {
          values[f.name] = JSON.parse(String(raw));
        } catch {
          setError(`Invalid JSON in ${f.label}`);
          setSubmitting(false);
          return;
        }
      } else values[f.name] = raw;
    }
    try {
      await onSubmit(values);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {triggerLabel && (
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {triggerLabel}
        </button>
      )}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
            <h2 className="text-lg font-semibold mb-4">{title}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              {fields.map((f) => (
                <div key={f.name}>
                  <label className="text-xs font-medium block mb-1">
                    {f.label}
                    {f.required && (
                      <span className="text-red-600 ml-0.5">*</span>
                    )}
                  </label>
                  {f.type === "boolean" ? (
                    <input
                      type="checkbox"
                      name={f.name}
                      defaultChecked={Boolean(
                        initialValues?.[f.name] ?? f.defaultValue,
                      )}
                      className="h-4 w-4"
                    />
                  ) : f.type === "select" ? (
                    <select
                      name={f.name}
                      required={f.required}
                      defaultValue={String(
                        initialValues?.[f.name] ?? f.defaultValue ?? "",
                      )}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="">--</option>
                      {f.options?.map((o) => {
                        const val = typeof o === "string" ? o : o.value;
                        const lbl = typeof o === "string" ? o : o.label;
                        return (
                          <option key={val} value={val}>
                            {lbl}
                          </option>
                        );
                      })}
                    </select>
                  ) : f.type === "json" ? (
                    <textarea
                      name={f.name}
                      rows={4}
                      defaultValue={String(
                        initialValues?.[f.name] != null
                          ? JSON.stringify(initialValues[f.name], null, 2)
                          : (f.defaultValue ?? "{}"),
                      )}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm font-mono"
                    />
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      name={f.name}
                      required={f.required}
                      defaultValue={
                        initialValues?.[f.name] != null
                          ? String(initialValues[f.name])
                          : f.defaultValue == null
                            ? ""
                            : String(f.defaultValue)
                      }
                      step={f.type === "number" ? "any" : undefined}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    />
                  )}
                </div>
              ))}
              {error && <div className="text-sm text-red-600">{error}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {submitting
                    ? "..."
                    : (submitLabel ?? (initialValues ? "Save" : "Create"))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
