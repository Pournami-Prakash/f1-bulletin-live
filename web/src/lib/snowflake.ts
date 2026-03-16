/**
 * lib/snowflake.ts
 * Single source of truth for all Snowflake connectivity.
 * Routes import from here — nothing else.
 * delete src/lib/snowflakeClient.ts after migrating.
 */

import snowflake from "snowflake-sdk";

// ---------------------------------------------------------------------------
// Config — validates env vars at call time, not module load time
// ---------------------------------------------------------------------------

function getBaseConfig() {
  const required = {
    account:  process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USER,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database:  process.env.SNOWFLAKE_DATABASE,
    role:      process.env.SNOWFLAKE_ROLE,
    schema:    process.env.SNOWFLAKE_SCHEMA,
  };

  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Missing Snowflake env vars: ${missing.join(", ")}`);

  return required as Required<typeof required>;
}

function buildAuthConfig(): Partial<snowflake.ConnectionOptions> {
  // Prefer key-pair auth (production). Falls back to password (dev).
  const pkB64 = process.env.SNOWFLAKE_PRIVATE_KEY_B64;
  if (pkB64) {
    return {
      authenticator: "SNOWFLAKE_JWT",
      privateKey: Buffer.from(pkB64, "base64").toString("utf8"),
    } as Partial<snowflake.ConnectionOptions>;
  }

  const password = process.env.SNOWFLAKE_PASSWORD;
  if (!password) throw new Error("Missing SNOWFLAKE_PASSWORD (or set SNOWFLAKE_PRIVATE_KEY_B64)");
  return { password };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateConnectionOptions {
  schema?:    string;
  warehouse?: string;
  role?:      string;
}

export function createConnection(opts: CreateConnectionOptions = {}): snowflake.Connection {
  const base = getBaseConfig();
  const auth = buildAuthConfig();

  return snowflake.createConnection({
    account:   base.account,
    username:  base.username,
    warehouse: opts.warehouse ?? base.warehouse,
    database:  base.database,
    role:      opts.role      ?? base.role,
    ...(process.env.SNOWFLAKE_REGION ? { region: process.env.SNOWFLAKE_REGION } : {}),
    schema: opts.schema ?? base.schema,
    ...auth,
    logLevel: process.env.NODE_ENV === "development" ? "warn" : "error",
  } as snowflake.ConnectionOptions);
}

// ---------------------------------------------------------------------------
// Promise wrappers
// ---------------------------------------------------------------------------

export function connectAsync(conn: snowflake.Connection): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.connect((err) => (err ? reject(err) : resolve()));
  });
}

export function executeAsync<T = Record<string, unknown>>(
  conn: snowflake.Connection,
  sqlText: string,
  binds: unknown[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds: binds as never[],
      complete: (err, _stmt, rows) => {
        if (err) return reject(err);
        resolve((rows ?? []) as T[]);
      },
    });
  });
}

export function destroyAsync(conn: snowflake.Connection): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.destroy((err) => {
      // "Connection not open" on destroy is not an error worth surfacing
      if (err && !/not open/i.test(err.message)) return reject(err);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

function isTransientError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? "").toLowerCase();
  return (
    msg.includes("network")      ||
    msg.includes("timeout")      ||
    msg.includes("temporarily")  ||
    msg.includes("connection")   ||
    msg.includes("socket")       ||
    msg.includes("503")          ||
    msg.includes("gateway")
  );
}

export async function executeWithRetry<T = Record<string, unknown>>(
  conn: snowflake.Connection,
  sqlText: string,
  binds: unknown[] = [],
  maxRetries = 2
): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await executeAsync<T>(conn, sqlText, binds);
    } catch (e) {
      if (attempt >= maxRetries || !isTransientError(e)) throw e;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
}

// ---------------------------------------------------------------------------
// Session initialisation (call after connectAsync for production routes)
// ---------------------------------------------------------------------------

export async function initSession(conn: snowflake.Connection, queryTag: string): Promise<void> {
  await executeWithRetry(conn, `ALTER SESSION SET QUERY_TAG = ?`, [queryTag], 1);
  await executeWithRetry(conn, `ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = 20`, [], 1);
  await executeWithRetry(conn, `ALTER SESSION SET TIMEZONE = 'UTC'`, [], 1);
}

// ---------------------------------------------------------------------------
// High-level one-shot query (connect → query → destroy)
// ---------------------------------------------------------------------------

export async function query<T = Record<string, unknown>>(
  sql: string,
  binds: unknown[] = [],
  opts: CreateConnectionOptions = {}
): Promise<T[]> {
  const conn = createConnection(opts);
  try {
    await connectAsync(conn);
    return await executeWithRetry<T>(conn, sql, binds);
  } finally {
    await destroyAsync(conn).catch(() => {}); // best-effort; don't mask original error
  }
}

// ---------------------------------------------------------------------------
// Row normalizer — Snowflake returns UPPER_CASE column names
// ---------------------------------------------------------------------------

export function normalizeRow<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])
  ) as T;
}

export function normalizeRows<T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => normalizeRow<T>(r));
}
