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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface SelectOption {
  value: string;
  label: string;
}

/** A section groups fields under a <fieldset> + <legend>. */
interface SectionDef {
  type: "section";
  legend: string;
}

/** A tabs entry renders a tabbed interface inside the form. */
interface TabsDef {
  type: "tabs";
  tabs: { label: string; fields: FieldDef[] }[];
}

interface FieldDef {
  name: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "json" | "datetime";
  options?: string[] | SelectOption[];
  required?: boolean;
  defaultValue?: string | number | boolean;
  /** Only for "select" — dynamically compute options from current form values */
  dynamicOptions?: (
    values: Record<string, unknown>,
  ) => string[] | SelectOption[];
  /** Render as read-only display text (for edit modals showing computed values) */
  readOnly?: boolean;
  /** Placeholder text */
  placeholder?: string;
}

/** Union: a field entry in the flat array can be a field, section header, or tabs block. */
type FormEntry = FieldDef | SectionDef | TabsDef;

interface FormDialogProps {
  title: string;
  fields: FormEntry[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  triggerLabel?: string;
  initialValues?: Record<string, unknown>;
  submitLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Widen the dialog (e.g. for sectioned forms) */
  wide?: boolean;
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
  wide,
}: FormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = controlledOpen != null ? controlledOpen : internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Collect all FieldDefs (flatten from sections/tabs) for FormData extraction
  function collectFieldDefs(entries: FormEntry[]): FieldDef[] {
    const out: FieldDef[] = [];
    for (const e of entries) {
      if ("type" in e && (e.type === "section" || e.type === "tabs")) {
        if (e.type === "tabs") {
          for (const t of e.tabs) out.push(...t.fields);
        }
      } else {
        out.push(e as FieldDef);
      }
    }
    return out;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const allFields = collectFieldDefs(fields);
    const values: Record<string, unknown> = {};
    for (const f of allFields) {
      if (f.readOnly) continue;
      const raw = fd.get(f.name);
      if (raw == null || raw === "") continue;
      if (f.type === "number") values[f.name] = Number(raw);
      else if (f.type === "boolean") values[f.name] = raw === "on";
      else if (f.type === "datetime") {
        // Convert datetime-local (local time, no tz) to ISO string
        values[f.name] = new Date(String(raw)).toISOString();
      } else if (f.type === "json") {
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
      <DialogContent
        className={`${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[85vh] overflow-y-auto`}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {renderFormEntries(fields, initialValues)}
          {error && (
            <div className="text-xs text-destructive rounded-md bg-destructive/10 px-3 py-2">
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

// ---------------------------------------------------------------------------
// Internal: render a single field
// ---------------------------------------------------------------------------
function renderField(f: FieldDef, iv?: Record<string, unknown>) {
  if (f.readOnly) {
    return (
      <div className="text-xs text-muted-foreground py-1">
        {iv?.[f.name] != null ? String(iv[f.name]) : "—"}
      </div>
    );
  }
  if (f.type === "boolean") {
    return (
      <input
        type="checkbox"
        name={f.name}
        defaultChecked={Boolean(iv?.[f.name] ?? f.defaultValue)}
        className="h-4 w-4"
      />
    );
  }
  if (f.type === "select") {
    return (
      <select
        name={f.name}
        required={f.required}
        defaultValue={String(iv?.[f.name] ?? f.defaultValue ?? "")}
        className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
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
    );
  }
  if (f.type === "json") {
    return (
      <textarea
        name={f.name}
        rows={4}
        defaultValue={String(
          iv?.[f.name] != null
            ? JSON.stringify(iv[f.name], null, 2)
            : (f.defaultValue ?? "{}"),
        )}
        className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-mono focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    );
  }
  if (f.type === "datetime") {
    const toLocal = (v: unknown): string => {
      if (!v) return "";
      const d = new Date(String(v));
      if (isNaN(d.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    return (
      <Input
        type="datetime-local"
        name={f.name}
        required={f.required}
        defaultValue={toLocal(iv?.[f.name] ?? f.defaultValue)}
      />
    );
  }
  return (
    <Input
      type={f.type === "number" ? "number" : "text"}
      name={f.name}
      required={f.required}
      placeholder={f.placeholder}
      defaultValue={
        iv?.[f.name] != null
          ? String(iv[f.name])
          : f.defaultValue == null
            ? ""
            : String(f.defaultValue)
      }
      step={f.type === "number" ? "any" : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// Internal: render a labeled field block
// ---------------------------------------------------------------------------
function FieldBlock({ f, iv }: { f: FieldDef; iv?: Record<string, unknown> }) {
  return (
    <div key={f.name}>
      <label className="text-xs font-medium block mb-1 text-foreground">
        {f.label}
        {f.required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {renderField(f, iv)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: render the full entries array (fields, sections, tabs)
// ---------------------------------------------------------------------------
function renderFormEntries(entries: FormEntry[], iv?: Record<string, unknown>) {
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < entries.length) {
    const entry = entries[i];
    // Section: collect fields and tabs until next section/end
    if ("type" in entry && entry.type === "section") {
      const sectionChildren: (FieldDef | TabsDef)[] = [];
      i++;
      while (i < entries.length) {
        const next = entries[i];
        if ("type" in next && next.type === "section") break;
        sectionChildren.push(next as FieldDef | TabsDef);
        i++;
      }
      nodes.push(
        <fieldset
          key={`section-${nodes.length}`}
          className="border rounded-md p-3 space-y-2"
        >
          <legend className="text-xs font-semibold px-1 text-muted-foreground uppercase tracking-wide">
            {entry.legend}
          </legend>
          {sectionChildren.map((child) => {
            if ("type" in child && child.type === "tabs") {
              const tabsDef = child;
              return (
                <Tabs
                  key={`tabs-${nodes.length}-${tabsDef.tabs[0]?.label ?? ""}`}
                  defaultValue={tabsDef.tabs[0]?.label ?? ""}
                  className="w-full"
                >
                  <TabsList variant="line">
                    {tabsDef.tabs.map((t) => (
                      <TabsTrigger key={t.label} value={t.label}>
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {tabsDef.tabs.map((t) => (
                    <TabsContent
                      key={t.label}
                      value={t.label}
                      className="space-y-2 pt-1"
                    >
                      {t.fields.map((tf) => (
                        <FieldBlock key={tf.name} f={tf} iv={iv} />
                      ))}
                    </TabsContent>
                  ))}
                </Tabs>
              );
            }
            const sf = child as FieldDef;
            return <FieldBlock key={sf.name} f={sf} iv={iv} />;
          })}
        </fieldset>,
      );
      continue;
    }
    // Tabs: render tabbed sub-forms
    if ("type" in entry && entry.type === "tabs") {
      const tabsDef = entry;
      nodes.push(
        <Tabs
          key={`tabs-${nodes.length}`}
          defaultValue={tabsDef.tabs[0]?.label ?? ""}
          className="w-full"
        >
          <TabsList variant="line">
            {tabsDef.tabs.map((t) => (
              <TabsTrigger key={t.label} value={t.label}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabsDef.tabs.map((t) => (
            <TabsContent
              key={t.label}
              value={t.label}
              className="space-y-2 pt-1"
            >
              {t.fields.map((tf) => (
                <FieldBlock key={tf.name} f={tf} iv={iv} />
              ))}
            </TabsContent>
          ))}
        </Tabs>,
      );
      i++;
      continue;
    }
    // Plain field
    nodes.push(
      <FieldBlock
        key={(entry as FieldDef).name}
        f={entry as FieldDef}
        iv={iv}
      />,
    );
    i++;
  }
  return nodes;
}
