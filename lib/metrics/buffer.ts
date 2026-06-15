/**
 * In-memory ring buffer for request logs. The Flusher drains this on a timer.
 */
import { env } from "@/lib/env";

export interface RequestLogRecord {
  /** Row ID from the request_log table. Present only on completion updates. */
  requestId?: number | bigint;
  ts: number; // epoch ms
  apiKeyId: string;
  apiKeyName: string;
  modelId: string;
  providerId: string;
  providerName: string;
  realModelId: string;
  apiModeIn: "openai" | "anthropic";
  apiModeOut: "openai" | "anthropic";
  stream: boolean;
  status: number;
  errorCode: string | null;
  ttftMs: number | null;
  /** Output tokens per second (only output generation speed, excluding input) */
  tpsOut: number | null;
  latencyMs: number;
  inputTokens: number;
  cachedReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  ip: string | null;
  userAgent: string | null;
  /** Whether the request has fully completed (success or error). */
  completed?: boolean;
  /** Whether the request was aborted by the client disconnecting. */
  aborted?: boolean;
}

class MetricsBuffer {
  private queue: RequestLogRecord[] = [];

  push(record: RequestLogRecord): void {
    if (this.queue.length >= env.METRICS_BUFFER_MAX) {
      // Drop oldest under back-pressure rather than crash.
      this.queue.shift();
    }
    this.queue.push(record);
  }

  /** Drain up to `limit` records (default: all). */
  drain(limit?: number): RequestLogRecord[] {
    if (limit == null || limit >= this.queue.length) {
      const all = this.queue;
      this.queue = [];
      return all;
    }
    return this.queue.splice(0, limit);
  }

  get size(): number {
    return this.queue.length;
  }
}

const globalForBuf = globalThis as unknown as {
  __ucpb_metrics?: MetricsBuffer;
};

// Keep a process-wide singleton in every environment. In production builds,
// Next.js may evaluate modules from route handlers and background workers via
// different chunks; without the global reference, requests can push into one
// buffer instance while the flusher drains another empty instance.
export const metricsBuffer: MetricsBuffer =
  globalForBuf.__ucpb_metrics ?? new MetricsBuffer();
globalForBuf.__ucpb_metrics = metricsBuffer;
