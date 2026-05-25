/**
 * In-memory per-provider active (in-flight) request counter.
 *
 * Uses globalThis to survive Next.js hot reload without creating multiple maps.
 * This is a single-process counter — suitable for single-container deployments.
 * For multi-replica setups, a shared store (Redis, etc.) would be needed.
 */

const GLOBAL_KEY = "__ucpb_inflight";

function getMap(): Map<string, number> {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, number>();
  return g[GLOBAL_KEY] as Map<string, number>;
}

export const activeRequests = {
  incr(providerId: string): void {
    const map = getMap();
    map.set(providerId, (map.get(providerId) ?? 0) + 1);
  },

  decr(providerId: string): void {
    const map = getMap();
    const current = map.get(providerId) ?? 0;
    if (current <= 1) {
      map.delete(providerId);
    } else {
      map.set(providerId, current - 1);
    }
  },

  get(providerId: string): number {
    return getMap().get(providerId) ?? 0;
  },
};
