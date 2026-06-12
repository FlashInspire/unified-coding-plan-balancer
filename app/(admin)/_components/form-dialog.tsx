"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  initialValues?: Record<string, unknown>;
  submitLabel?: string;
  open?: boolean;
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
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {triggerLabel && (
        <DialogTrigger asChild>
          <Button size="sm">{triggerLabel}</Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map((f) => (
            <div key={f.name}>
              <label className="text-xs font-medium block mb-1 text-foreground">
                {f.label}
                {f.required && (
                  <span className="text-destructive ml-0.5">*</span>
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
                  className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
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
                  className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm font-mono focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              ) : (
                <Input
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
                />
              )}
            </div>
          ))}
          {error && (
            <div className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "..."
                : (submitLabel ?? (initialValues ? "Save" : "Create"))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
