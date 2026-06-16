import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Return the display name for an entity, falling back to its id when the name
 * is missing. Treats null, undefined, and empty/whitespace-only strings as
 * "missing", so historical rows that stored an empty string still get a
 * sensible fallback.
 */
export function displayName(
  name: string | null | undefined,
  id: string | null | undefined,
  fallback = "—",
): string {
  if (name != null && name.trim() !== "") return name;
  if (id != null && id.trim() !== "") return id;
  return fallback;
}
