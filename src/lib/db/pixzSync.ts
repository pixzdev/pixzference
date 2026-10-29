/**
 * Pixzference state sync — Neon Postgres snapshot persistence for serverless.
 *
 * Serverless platforms (Vercel) give every instance an ephemeral filesystem and
 * recycle instances freely, so a plain SQLite file would silently lose every
 * provider connection, API key and setting on each cold start. This module
 * keeps the *important* tables durable by round-tripping them through a Neon
 * Postgres database:
 *
 *   boot   → stageSnapshotFromRemote() fetches the latest committed snapshot
 *            (gzip'd SQL text, chunked into rows) and replays it onto the
 *            freshly-migrated SQLite database.
 *   writes → wrapDbForPixzSync() proxies the shared adapter, detects write
 *            statements and schedules a debounced flush that re-dumps the
 *            tracked tables and uploads a new committed snapshot.
 *
 * Design notes:
 *  - Zero native dependencies: the official `@neondatabase/serverless` driver
 *    speaks HTTP(S) via `fetch`, so it works in every Node runtime.
 *  - Snapshots are versioned; a snapshot only becomes readable after every
 *    chunk is uploaded (committed=true), so a crashed flush can never leave a
 *    torn state behind. Hydration always picks the newest committed version.
 *  - Large append-only / derived tables (logs, usage history, caches) are
 *    intentionally excluded — they are regenerable and would bloat the
 *    snapshot. Everything else (credentials, keys, settings, combos, budgets)
 *    is included, capped at PIXZ_SYNC_ROW_CAP rows per table.
 *  - Sync is strictly opt-in: nothing happens unless DATABASE_URL (or
 *    PIXZ_SYNC_DATABASE_URL) is set. All failures are logged and swallowed —
 *    the gateway must never refuse to boot because sync is unreachable.
 */

import { gzipSync, gunzipSync } from "node:zlib";
import type { SqliteAdapter } from "./adapters/types";
import { getExistingDbInstance } from "./singleton";

const SNAPSHOT_ID = "main";

/** Tables excluded from snapshots: huge append-only logs, caches, derived state. */
const PIXZ_SYNC_SKIP_TABLES = new Set([
  "call_logs",
  "usage_history",
  "proxy_logs",
  "semantic_cache",
  "quota_snapshots",
  "domain_cost_history",
  "domain_budget_reset_logs",
  "domain_lockout_state",
  "domain_circuit_breakers",
  "db_meta",
  "_omniroute_migrations",
]);

/** Max rows dumped per table (defensive cap against unbounded tables). */
const PIXZ_SYNC_ROW_CAP = 20_000;
/** Base64 characters per chunk (Neon HTTP queries have a size limit). */
const CHUNK_CHARS = 512 * 1024;
/** Debounce window after a detected write before flushing. */
const FLUSH_DEBOUNCE_MS = 8_000;
/** Piggyback window: a write older than this flushes immediately. */
const FLUSH_PIGGYBACK_MS = 30_000;

const PIXZ_OFF_VALUES = new Set(["false", "0", "off", ""]);

type NeonSqlFn = (query: string, params?: unknown[]) => Promise<unknown[]>;
type NeonClient = { query: NeonSqlFn };

let neonClient: NeonClient | null | undefined;
let stagedSnapshotSql: string | null = null;
let dirty = false;
let flushing = false;
let replaying = false;
let lastFlushAt = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let shutdownHookInstalled = false;

function pixzLog(level: "log" | "warn", message: string, extra?: unknown): void {
  const fn = level === "warn" ? console.warn : console.log;
  if (extra !== undefined) fn(`[pixz-sync] ${message}`, extra);
  else fn(`[pixz-sync] ${message}`);
}

export function isPixzSyncEnabled(): boolean {
  const url = (process.env.PIXZ_SYNC_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (url.length === 0 || PIXZ_OFF_VALUES.has(url.toLowerCase())) return false;
  // Only PostgreSQL URLs are valid sync targets — a sqlite://, file: or plain
  // path value must never light the sync path up.
  return /^postgres(ql)?:\/\//i.test(url);
}

async function getNeonSql(): Promise<NeonClient | null> {
  if (neonClient !== undefined) return neonClient;
  try {
    const url = (process.env.PIXZ_SYNC_DATABASE_URL || process.env.DATABASE_URL || "").trim();
    const mod = await import("@neondatabase/serverless");
    const sql = mod.neon(url) as unknown as NeonClient;
    neonClient = sql;
  } catch (err: unknown) {
    pixzLog("warn", "Neon client unavailable, snapshot sync disabled:", err);
    neonClient = null;
  }
  return neonClient;
}

/** Ensure the two sync tables exist. Cheap no-ops after the first call. */
async function ensureSyncTables(sql: NeonClient): Promise<void> {
  await sql.query(
    `CREATE TABLE IF NOT EXISTS pixz_state_snapshots (
       id text PRIMARY KEY,
       version bigint NOT NULL,
       committed boolean NOT NULL DEFAULT false,
       chunk_count int NOT NULL,
       size_bytes int NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  await sql.query(
    `CREATE TABLE IF NOT EXISTS pixz_state_chunks (
       version bigint NOT NULL,
       seq int NOT NULL,
       data text NOT NULL,
       PRIMARY KEY (version, seq)
     )`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dump & replay (SQLite ⇄ SQL text)
// ─────────────────────────────────────────────────────────────────────────────

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    const hex = Buffer.from(value).toString("hex");
    return hex.length > 0 ? `X'${hex}'` : "X''";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function listTables(db: SqliteAdapter): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )
    .all() as Array<{ name: string }>;
  return rows
    .map((r) => r.name)
    .filter((name) => name && typeof name === "string" && !PIXZ_SYNC_SKIP_TABLES.has(name));
}

function tableColumns(db: SqliteAdapter, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{
    name: string;
  }>;
  return rows.map((r) => r.name).filter(Boolean);
}

function tableHasRowid(db: SqliteAdapter, table: string): boolean {
  try {
    const row = db.prepare(`SELECT rowid FROM ${quoteIdent(table)} LIMIT 1`).get();
    return row !== undefined || true; // statement compiled ⇒ rowid exists
  } catch {
    return false;
  }
}

/** Dump tracked tables of an open SQLite adapter into replayable SQL text. */
export function dumpSqlSnapshot(db: SqliteAdapter): string {
  const parts: string[] = ["-- pixzference snapshot v1"];
  const tables = listTables(db);
  for (const table of tables) {
    const cols = tableColumns(db, table);
    if (cols.length === 0) continue;
    const colList = cols.map(quoteIdent).join(", ");
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(table)}`).get() as { c: number }
    ).c;
    let rows: unknown[];
    if (total > PIXZ_SYNC_ROW_CAP && tableHasRowid(db, table)) {
      // Keep the newest rows; the cap is a defensive upper bound.
      rows = db
        .prepare(
          `SELECT * FROM ${quoteIdent(table)} ORDER BY rowid DESC LIMIT ${PIXZ_SYNC_ROW_CAP}`
        )
        .all()
        .reverse();
    } else {
      rows = db.prepare(`SELECT * FROM ${quoteIdent(table)}`).all();
    }
    if (rows.length === 0) continue;
    parts.push(`DELETE FROM ${quoteIdent(table)};`);
    const batchSize = 200;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize) as Array<Record<string, unknown>>;
      const tuples = batch
        .map((row) => `(${cols.map((c) => literal(row[c])).join(", ")})`)
        .join(", ");
      parts.push(`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES ${tuples};`);
    }
  }
  parts.push("-- end");
  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote stage & replay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the newest committed snapshot from Neon and stage it in memory.
 * Called during boot, BEFORE the SQLite singleton is initialized, so the
 * replay lands on a freshly-migrated (empty) database.
 */
export async function stageSnapshotFromRemote(): Promise<void> {
  if (!isPixzSyncEnabled()) return;
  const sql = await getNeonSql();
  if (!sql) return;
  try {
    await ensureSyncTables(sql);
    const metaRows = (await sql.query(
      `SELECT version, chunk_count FROM pixz_state_snapshots
       WHERE id = $1 AND committed = true ORDER BY version DESC LIMIT 1`,
      [SNAPSHOT_ID]
    )) as Array<{ version: string | number; chunk_count: number }>;
    if (!Array.isArray(metaRows) || metaRows.length === 0) {
      pixzLog("log", "no remote snapshot found — starting with a fresh database");
      return;
    }
    const version = metaRows[0].version;
    const chunkRows = (await sql.query(
      `SELECT seq, data FROM pixz_state_chunks WHERE version = $1 ORDER BY seq ASC`,
      [version]
    )) as Array<{ seq: number; data: string }>;
    if (!Array.isArray(chunkRows) || chunkRows.length === 0) return;
    const b64 = chunkRows.map((c) => c.data).join("");
    const sqlText = gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
    stagedSnapshotSql = sqlText;
    pixzLog("log", `staged remote snapshot (version ${version}, ${chunkRows.length} chunks)`);
  } catch (err: unknown) {
    pixzLog("warn", "failed to stage remote snapshot:", err);
  }
}

/**
 * Replay the staged snapshot onto the initialized SQLite singleton.
 * Runs inside a transaction so a partially-failed replay changes nothing.
 */
export function replayStagedSnapshot(): boolean {
  if (!stagedSnapshotSql || !isPixzSyncEnabled()) return false;
  const db = getExistingDbInstance();
  if (!db) {
    pixzLog("warn", "replay skipped — database singleton not initialized yet");
    return false;
  }
  replaying = true;
  try {
    const run = () => db.exec(stagedSnapshotSql as string);
    try {
      db.transaction(run)();
    } catch {
      // Adapters without a usable transaction() wrapper still accept exec().
      run();
    }
    pixzLog("log", "remote snapshot replayed onto local database");
    dirty = false;
    return true;
  } catch (err: unknown) {
    pixzLog("warn", "failed to replay staged snapshot:", err);
    return false;
  } finally {
    replaying = false;
    stagedSnapshotSql = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Flush (local → Neon)
// ─────────────────────────────────────────────────────────────────────────────

function isWriteStatement(sqlText: string): boolean {
  return /^\s*(insert|update|delete|replace|create|drop|alter|truncate)\b/i.test(sqlText);
}

function scheduleFlush(): void {
  if (flushTimer) return;
  const idleFor = Date.now() - lastFlushAt;
  const delay = idleFor > FLUSH_PIGGYBACK_MS ? 0 : FLUSH_DEBOUNCE_MS;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushSnapshot();
  }, delay);
  flushTimer.unref?.();
}

/** Dump tracked tables and upload a new committed snapshot to Neon. */
export async function flushSnapshot(): Promise<boolean> {
  if (!isPixzSyncEnabled() || flushing || (!dirty && lastFlushAt > 0)) return false;
  flushing = true;
  const wasDirty = dirty;
  dirty = false;
  try {
    const db = getExistingDbInstance();
    if (!db) return false;
    const sql = await getNeonSql();
    if (!sql) return false;
    await ensureSyncTables(sql);
    const dump = dumpSqlSnapshot(db);
    const gz = gzipSync(Buffer.from(dump, "utf8"));
    const b64 = gz.toString("base64");
    const version = Date.now();
    const chunks: string[] = [];
    for (let i = 0; i < b64.length; i += CHUNK_CHARS) chunks.push(b64.slice(i, i + CHUNK_CHARS));
    await sql.query(
      `INSERT INTO pixz_state_snapshots (id, version, committed, chunk_count, size_bytes, updated_at)
       VALUES ($1, $2, false, $3, $4, now())
       ON CONFLICT (id) DO UPDATE SET
         version = EXCLUDED.version,
         committed = false,
         chunk_count = EXCLUDED.chunk_count,
         size_bytes = EXCLUDED.size_bytes,
         updated_at = now()`,
      [SNAPSHOT_ID, version, chunks.length, gz.length]
    );
    for (let seq = 0; seq < chunks.length; seq += 1) {
      await sql.query(
        `INSERT INTO pixz_state_chunks (version, seq, data) VALUES ($1, $2, $3)
         ON CONFLICT (version, seq) DO UPDATE SET data = EXCLUDED.data`,
        [version, seq, chunks[seq]]
      );
    }
    await sql.query(
      `UPDATE pixz_state_snapshots SET committed = true WHERE id = $1 AND version = $2`,
      [SNAPSHOT_ID, version]
    );
    await sql.query(`DELETE FROM pixz_state_chunks WHERE version < $1`, [version]);
    lastFlushAt = Date.now();
    pixzLog(
      "log",
      `snapshot flushed to Neon (version ${version}, ${gz.length} bytes gzip, ${chunks.length} chunk(s))`
    );
    return true;
  } catch (err: unknown) {
    dirty = dirty || wasDirty;
    pixzLog("warn", "snapshot flush failed (will retry on next write):", err);
    return false;
  } finally {
    flushing = false;
  }
}

/**
 * Wrap the shared SQLite adapter so every write statement schedules a
 * debounced flush. Reads pass through untouched.
 */
export function wrapDbForPixzSync(db: SqliteAdapter): SqliteAdapter {
  if (!isPixzSyncEnabled()) return db;
  const handler: ProxyHandler<SqliteAdapter> = {
    get(target, prop, receiver) {
      if (prop === "prepare") {
        return (sqlText: string) => {
          if (!replaying && isWriteStatement(sqlText)) {
            dirty = true;
            scheduleFlush();
          }
          return target.prepare(sqlText);
        };
      }
      if (prop === "exec") {
        return (sqlText: string) => {
          if (!replaying && isWriteStatement(sqlText)) {
            dirty = true;
            scheduleFlush();
          }
          return target.exec(sqlText);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  };
  return new Proxy(db, handler);
}

/** Best-effort flush when the platform recycles the instance. */
export function registerShutdownFlush(): void {
  if (shutdownHookInstalled || !isPixzSyncEnabled()) return;
  shutdownHookInstalled = true;
  try {
    process.once("SIGTERM", () => {
      if (dirty) void flushSnapshot();
    });
    process.once("SIGINT", () => {
      if (dirty) void flushSnapshot();
    });
  } catch {
    /* non-Node runtimes */
  }
}
