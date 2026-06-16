/**
 * GET /api/admin/logs/stream — Server-Sent Events notification endpoint.
 *
 * Does NOT send log data. Instead, polls every 5 seconds and emits:
 *   { type: "change" }  — when new logs match the current filter context
 *   { type: "heartbeat" } — keep-alive when nothing changed
 *
 * The client should treat "change" as a signal to re-fetch from the
 * paginated REST endpoint (GET /api/admin/logs).
 *
 * Query params (same as GET /api/admin/logs):
 *   modelId    = string (optional)
 *   providerId = string (optional)
 *   status     = "ok" | "error" | "inflight" (optional)
 *   search     = string (optional)
 */
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAuth } from "../../_lib/guard";
import { recentLogs } from "@/lib/metrics/queryRouter";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

const POLL_INTERVAL_MS = 5_000;

const querySchema = z.object({
  modelId: z.string().optional(),
  providerId: z.string().optional(),
  status: z.enum(["ok", "error", "inflight"]).optional(),
  search: z.string().optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const authResult = await requireAuth();
  if (authResult instanceof Response) return authResult;
  const session = authResult;

  const sp = req.nextUrl.searchParams;
  const q = querySchema.parse(Object.fromEntries(sp.entries()));

  // Non-admin users are restricted to their own API key data.
  const isAdmin = session.user.role === "admin";
  let apiKeyIds: string[] | undefined;
  if (!isAdmin) {
    apiKeyIds = await apiKeyRepo.findIdsByOwner(session.user.id);
    if (apiKeyIds.length === 0) {
      const empty = new ReadableStream({
        start(c) {
          c.close();
        },
      });
      return new Response(empty, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventData: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`),
          );
        } catch {
          // Controller already closed
        }
      };

      // Track the latest timestamp seen so we only emit "change" for genuinely new data.
      let lastSeenTs = Date.now();

      // Poll for new logs every POLL_INTERVAL_MS
      const interval = setInterval(async () => {
        try {
          const result = await recentLogs({
            from: lastSeenTs,
            limit: 1,
            modelId: q.modelId,
            providerId: q.providerId,
            status: q.status,
            search: q.search,
            ...(apiKeyIds ? { apiKeyIds } : {}),
          });
          if (result.rows.length > 0) {
            lastSeenTs = Number(result.rows[0].ts);
            send({ type: "change" });
          } else {
            send({ type: "heartbeat" });
          }
        } catch {
          // Best-effort
        }
      }, POLL_INTERVAL_MS);

      // Clean up when the client disconnects
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
