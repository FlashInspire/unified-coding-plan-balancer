/**
 * GET /api/admin/logs/stream — Server-Sent Events endpoint for live log updates.
 *
 * On connect, sends the most recent 50 log entries from the last 30 seconds,
 * then pushes new entries every 5 seconds until the client disconnects.
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
const INITIAL_WINDOW_MS = 30_000;
const BATCH_LIMIT = 50;

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
      // Return empty stream that closes immediately
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

      // Initial batch: last 30s of logs
      let lastSeenTs = Date.now() - INITIAL_WINDOW_MS;
      try {
        const initial = await recentLogs({
          from: lastSeenTs,
          limit: BATCH_LIMIT,
          modelId: q.modelId,
          providerId: q.providerId,
          status: q.status,
          search: q.search,
          ...(apiKeyIds ? { apiKeyIds } : {}),
        });
        if (initial.rows.length > 0) {
          // Advance cursor past the newest row we just sent
          const maxTs = initial.rows.reduce(
            (m, r) => Math.max(m, Number(r.ts)),
            lastSeenTs,
          );
          lastSeenTs = maxTs;
          send({ rows: initial.rows });
        }
      } catch {
        // Best-effort
      }

      // Poll for new logs every POLL_INTERVAL_MS
      const interval = setInterval(async () => {
        try {
          const result = await recentLogs({
            from: lastSeenTs,
            limit: BATCH_LIMIT,
            modelId: q.modelId,
            providerId: q.providerId,
            status: q.status,
            search: q.search,
            ...(apiKeyIds ? { apiKeyIds } : {}),
          });
          if (result.rows.length > 0) {
            const maxTs = result.rows.reduce(
              (m, r) => Math.max(m, Number(r.ts)),
              lastSeenTs,
            );
            lastSeenTs = maxTs;
            send({ rows: result.rows });
          } else {
            // Heartbeat to keep the connection alive
            send({ heartbeat: true });
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
