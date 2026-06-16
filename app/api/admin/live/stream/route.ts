/**
 * GET /api/admin/live/stream — Server-Sent Events endpoint.
 *
 * Pushes complete log records to the client in real-time:
 *   { type: "record", data: RecentLogRow }  — new or updated record
 *   { type: "heartbeat" }                    — keep-alive when nothing changed
 *
 * The client should insert new records at the top of the list, and
 * update existing records in-place when an ID already exists.
 *
 * Query params (same as GET /api/admin/live):
 *   modelId    = string (optional)
 *   providerId = string (optional)
 *   status     = "ok" | "error" | "inflight" (optional)
 *   search     = string (optional)
 */
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireAuth } from "../../_lib/guard";
import { recentLogs, recentLogsByIds } from "@/lib/metrics/queryRouter";
import type { RecentLogRow } from "@/lib/metrics/queryRouter";
import { apiKeyRepo } from "@/lib/repositories/apiKeyRepo";

const POLL_INTERVAL_MS = 3_000;

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

  const filterBase = {
    modelId: q.modelId,
    providerId: q.providerId,
    status: q.status,
    search: q.search,
    ...(apiKeyIds ? { apiKeyIds } : {}),
  };

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

      // Track the highest ID seen so far.
      let lastSeenId = 0;
      // Track IDs of records that are still in-flight (not completed/aborted).
      const inFlightIds = new Set<number>();

      // Poll for new / updated logs every POLL_INTERVAL_MS
      const interval = setInterval(async () => {
        try {
          const idsToRecheck = [...inFlightIds];
          const filterOpts = {
            apiKeyIds: filterBase.apiKeyIds,
            modelId: filterBase.modelId,
            providerId: filterBase.providerId,
            search: filterBase.search,
          };

          // Two parallel queries:
          // 1. Latest records (we filter for id > lastSeenId in-memory)
          // 2. Previously in-flight records that may have been updated
          const [latestResult, updatedRows] = await Promise.all([
            recentLogs({
              ...filterBase,
              limit: 50,
            }),
            idsToRecheck.length > 0
              ? recentLogsByIds(idsToRecheck, filterOpts)
              : Promise.resolve([]),
          ]);

          // Filter new records: only those with id > lastSeenId
          const newRows =
            lastSeenId > 0
              ? latestResult.rows.filter((r) => r.id > lastSeenId)
              : latestResult.rows;

          // Deduplicate: merge new and updated, preferring new rows
          const seen = new Map<number, RecentLogRow>();
          for (const row of newRows) {
            seen.set(row.id, row);
          }
          for (const row of updatedRows) {
            if (!seen.has(row.id)) {
              seen.set(row.id, row);
            }
          }

          // Update tracking state
          for (const row of seen.values()) {
            if (row.id > lastSeenId) {
              lastSeenId = row.id;
            }
            if (!row.completed && !row.aborted) {
              inFlightIds.add(row.id);
            } else {
              inFlightIds.delete(row.id);
            }
          }

          if (seen.size > 0) {
            // Send each record individually
            for (const row of seen.values()) {
              send({ type: "record", data: row });
            }
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
