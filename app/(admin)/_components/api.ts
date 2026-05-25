export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      msg = j.error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
