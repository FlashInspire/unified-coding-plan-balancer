/**
 * SQLite shard store: LRU-cached `better-sqlite3` connections to the per-date
 * shard files described in DESIGN §3.2. Strictly separated from Prisma.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import { env } from "@/lib/env";

type ShardKind = "log" | "stat" | "archive";

interface ShardEntry {
  db: Database.Database;
  lastUsed: number;
}

const cache = new Map<string, ShardEntry>();
const initialized = new Set<string>();

function dataDir(): string {
  const dir = env.DATA_DIR;
  return path.resolve(process.cwd(), dir);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function shardFile(kind: ShardKind, key: string): string {
  const root = dataDir();
  if (kind === "log") return path.join(root, "logs", `${key}.sqlite`);
  if (kind === "stat") return path.join(root, "stats", `${key}.sqlite`);
  return path.join(root, "archive", `${key}.sqlite`);
}

function evictIfNeeded(): void {
  while (cache.size > env.SQLITE_POOL_MAX) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of cache) {
      if (v.lastUsed < oldestTs) {
        oldestTs = v.lastUsed;
        oldestKey = k;
      }
    }
    if (!oldestKey) break;
    const entry = cache.get(oldestKey);
    cache.delete(oldestKey);
    try {
      entry?.db.close();
    } catch {
      /* ignore */
    }
  }
}

function applySchema(db: Database.Database, kind: ShardKind): void {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  if (kind === "log") {
    db.exec(`
      CREATE TABLE IF NOT EXISTS request_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        api_key_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        real_model_id TEXT NOT NULL,
        api_mode_in TEXT NOT NULL,
        api_mode_out TEXT NOT NULL,
        stream INTEGER NOT NULL,
        status INTEGER NOT NULL,
        error_code TEXT,
        ttft_ms INTEGER,
        tps_out REAL,
        latency_ms INTEGER,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        ip TEXT,
        user_agent TEXT,
        api_key_name TEXT,
        provider_name TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_request_log_ts ON request_log(ts);
      CREATE INDEX IF NOT EXISTS idx_request_log_key_ts ON request_log(api_key_id, ts);
      CREATE INDEX IF NOT EXISTS idx_request_log_model_ts ON request_log(model_id, ts);
      CREATE INDEX IF NOT EXISTS idx_request_log_provider_ts ON request_log(provider_id, ts);
    `);
    // Migrate: add columns that may be missing in older shards.
    migrateLogShard(db);
  } else if (kind === "stat") {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_minute (
        minute INTEGER NOT NULL,
        api_key_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        requests INTEGER NOT NULL DEFAULT 0,
        requests_ok INTEGER NOT NULL DEFAULT 0,
        requests_err INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        ttft_ms_sum INTEGER NOT NULL DEFAULT 0,
        ttft_ms_count INTEGER NOT NULL DEFAULT 0,
        tps_out_sum REAL NOT NULL DEFAULT 0,
        tps_out_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (minute, api_key_id, provider_id, model_id)
      );
      CREATE INDEX IF NOT EXISTS idx_usage_minute_key ON usage_minute(api_key_id, minute);
      CREATE INDEX IF NOT EXISTS idx_usage_minute_model ON usage_minute(model_id, minute);
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_hour (
        hour INTEGER NOT NULL,
        api_key_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        requests INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (hour, api_key_id, provider_id, model_id)
      );
      CREATE TABLE IF NOT EXISTS usage_day (
        day INTEGER NOT NULL,
        api_key_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        requests INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, api_key_id, provider_id, model_id)
      );
    `);
  }
}

/**
 * Add columns that may be missing in shards created before a schema upgrade.
 * SQLite ALTER TABLE ADD COLUMN silently fails if the column already exists
 * only if we catch the error, so we check pragma_table_info first.
 */
function migrateLogShard(db: Database.Database): void {
  const cols = (
    db.pragma("table_info(request_log)") as Array<{ name: string }>
  ).map((r) => r.name);
  if (!cols.includes("user_agent")) {
    db.exec("ALTER TABLE request_log ADD COLUMN user_agent TEXT");
  }
  if (!cols.includes("api_key_name")) {
    db.exec("ALTER TABLE request_log ADD COLUMN api_key_name TEXT");
  }
  if (!cols.includes("provider_name")) {
    db.exec("ALTER TABLE request_log ADD COLUMN provider_name TEXT");
  }
}

function openShard(kind: ShardKind, key: string): Database.Database {
  const cacheKey = `${kind}:${key}`;
  const entry = cache.get(cacheKey);
  if (entry) {
    entry.lastUsed = Date.now();
    return entry.db;
  }
  const file = shardFile(kind, key);
  ensureDir(path.dirname(file));
  const db = new Database(file);
  if (!initialized.has(cacheKey)) {
    applySchema(db, kind);
    initialized.add(cacheKey);
  }
  cache.set(cacheKey, { db, lastUsed: Date.now() });
  evictIfNeeded();
  return db;
}

/** YYYY-MM-DD in UTC. */
export function dateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM in UTC. */
export function monthKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 7);
}

/** YYYY in UTC. */
export function yearKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 4);
}

export const shardStore = {
  openLog: (key: string = dateKey()) => openShard("log", key),
  openStat: (key: string = monthKey()) => openShard("stat", key),
  openArchive: (key: string = yearKey()) => openShard("archive", key),
  /** For tests / shutdown. */
  closeAll: () => {
    for (const [, v] of cache) {
      try {
        v.db.close();
      } catch {
        /* ignore */
      }
    }
    cache.clear();
    initialized.clear();
  },
};

export function listShards(kind: ShardKind): string[] {
  const subdir =
    kind === "log" ? "logs" : kind === "stat" ? "stats" : "archive";
  const root = path.join(dataDir(), subdir);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((f) => f.endsWith(".sqlite"))
    .map((f) => f.slice(0, -".sqlite".length))
    .sort();
}
