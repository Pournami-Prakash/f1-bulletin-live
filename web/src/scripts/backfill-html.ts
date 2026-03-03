import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import snowflake from "snowflake-sdk";

type Row = {
  URL: string;
  SOURCE: string;
  FEED_URL: string;
  PAYLOAD_JSON: string;
};

function connectAsync(conn: snowflake.Connection) {
  return new Promise<void>((resolve, reject) => {
    conn.connect((err) => (err ? reject(err) : resolve()));
  });
}

function executeAsync(conn: snowflake.Connection, sqlText: string, binds: any[] = []) {
  return new Promise<{ rows: any[]; rowsAffected: number }>((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, stmt, rows) => {
        if (err) return reject(err);
        const rowsAffected =
          typeof (stmt as any)?.getNumUpdatedRows === "function"
            ? (stmt as any).getNumUpdatedRows()
            : 0;
        resolve({ rows: rows || [], rowsAffected });
      },
    });
  });
}

function destroyAsync(conn: snowflake.Connection) {
  return new Promise<void>((resolve) => {
    try {
      conn.destroy(() => resolve());
    } catch {
      resolve();
    }
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeBasicEntities(s: string) {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtmlToText(html: string) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeBasicEntities(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function extractMainText(html: string) {
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  if (articleMatch?.[0]) return stripHtmlToText(articleMatch[0]);

  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
  if (mainMatch?.[0]) return stripHtmlToText(mainMatch[0]);

  return stripHtmlToText(html);
}

async function fetchWithTimeout(url: string, ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "f1-bulletin-backfill/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function fetchFullText(url: string, timeoutMs: number) {
  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) return { ok: false, content_html: "", content_text: "", full_title: "", meta_description: "" };

    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const full_title = decodeBasicEntities((titleMatch?.[1] ?? "").trim());

    const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const meta_description = decodeBasicEntities((metaMatch?.[1] ?? "").trim());

    const content_text = extractMainText(html);

    return { ok: true, content_html: html, content_text, full_title, meta_description };
  } catch {
    return { ok: false, content_html: "", content_text: "", full_title: "", meta_description: "" };
  }
}

function safeJsonParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function hasUsefulContent(full: {
  ok: boolean;
  content_html: string;
  content_text: string;
  full_title: string;
  meta_description: string;
}) {
  // tune thresholds as needed; these avoid inserting useless empty snapshots
  const hasText = !!full.content_text && full.content_text.trim().length >= 200;
  const hasHtml = !!full.content_html && full.content_html.trim().length >= 5000;
  const hasSignals = !!full.full_title || !!full.meta_description;
  return hasText || hasHtml || hasSignals;
}

async function main() {
  const {
    SNOWFLAKE_ACCOUNT,
    SNOWFLAKE_REGION,
    SNOWFLAKE_USER,
    SNOWFLAKE_PASSWORD,
    SNOWFLAKE_WAREHOUSE,
    SNOWFLAKE_DATABASE,
    SNOWFLAKE_SCHEMA,
    SNOWFLAKE_ROLE,
  } = process.env;

  if (
    !SNOWFLAKE_ACCOUNT ||
    !SNOWFLAKE_REGION ||
    !SNOWFLAKE_USER ||
    !SNOWFLAKE_PASSWORD ||
    !SNOWFLAKE_WAREHOUSE ||
    !SNOWFLAKE_DATABASE ||
    !SNOWFLAKE_SCHEMA
  ) {
    throw new Error("Missing Snowflake env vars. Check your .env / process.env setup.");
  }

  const CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY ?? "5");
  const TIMEOUT_MS = Number(process.env.BACKFILL_TIMEOUT_MS ?? "15000");
  const SLEEP_BETWEEN_MS = Number(process.env.BACKFILL_SLEEP_MS ?? "150");
  const LIMIT = Number(process.env.BACKFILL_LIMIT ?? "0");

  // Optional: stop backfilling reddit-like URLs that are stored inside RSS_ITEMS
  const SKIP_REDDIT = (process.env.BACKFILL_SKIP_REDDIT ?? "1") === "1";

  const ingestId = `backfill_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const conn = snowflake.createConnection({
    account: SNOWFLAKE_ACCOUNT,
    region: SNOWFLAKE_REGION,
    username: SNOWFLAKE_USER,
    password: SNOWFLAKE_PASSWORD,
    warehouse: SNOWFLAKE_WAREHOUSE,
    database: SNOWFLAKE_DATABASE,
    schema: SNOWFLAKE_SCHEMA,
    role: SNOWFLAKE_ROLE,
  });

  try {
    await connectAsync(conn);

    const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : "";
    const skipRedditClause = SKIP_REDDIT
    ? `AND NOT REGEXP_LIKE(payload:"link"::STRING, '^https?://(www\\.)?reddit\\.com/', 'i')`
    : "";
  

    const pickSql = `
      WITH latest AS (
        SELECT
          payload:"link"::STRING AS url,
          source,
          feed_url,
          payload::STRING AS payload_json,
          content_text,
          content_html,
          fetched_at,
          ROW_NUMBER() OVER (PARTITION BY payload:"link"::STRING ORDER BY fetched_at DESC) AS rn
        FROM F1_BULLETIN.RAW.RSS_ITEMS
        WHERE payload:"link" IS NOT NULL
        ${skipRedditClause}
      )
      SELECT
        url AS "URL",
        source AS "SOURCE",
        feed_url AS "FEED_URL",
        payload_json AS "PAYLOAD_JSON"
      FROM latest
      WHERE rn = 1
        AND (content_text IS NULL OR LENGTH(content_text) = 0)
        AND (content_html IS NULL OR LENGTH(content_html) = 0)
      ${limitClause};
    `;

    const picked = await executeAsync(conn, pickSql);
    const targets: Row[] = picked.rows as any[];

    console.log(
      JSON.stringify(
        {
          ok: true,
          ingestId,
          targets: targets.length,
          concurrency: CONCURRENCY,
          timeoutMs: TIMEOUT_MS,
          sleepMs: SLEEP_BETWEEN_MS,
          limit: LIMIT,
          skipReddit: SKIP_REDDIT,
        },
        null,
        2
      )
    );

    let attempted = 0;
    let fetchedOk = 0;
    let inserted = 0;
    let skippedNoContent = 0;
    let skippedBadUrl = 0;

    let idx = 0;

    async function worker(workerId: number) {
      while (true) {
        const i = idx++;
        if (i >= targets.length) return;

        const t = targets[i];
        attempted += 1;

        const urlRaw = (t.URL || "").trim();
        if (!/^https?:\/\//i.test(urlRaw)) {
          skippedBadUrl += 1;
          continue;
        }

        // Normalize URL (strip query) to reduce duplicates
        const urlNoQuery = urlRaw.replace(/\?.*$/, "");

        const full = await fetchFullText(urlNoQuery, TIMEOUT_MS);

        if (full.ok && full.content_text && full.content_text.trim().length > 0) {
          fetchedOk += 1;
        }

        // If fetch produced nothing useful, do NOT insert a new snapshot (reduces REFRESH noise)
        if (!hasUsefulContent(full)) {
          skippedNoContent += 1;
          if (SLEEP_BETWEEN_MS > 0) await sleep(SLEEP_BETWEEN_MS);
          continue;
        }

        const payloadObj = safeJsonParse(t.PAYLOAD_JSON) ?? {};
        payloadObj.full_title = full.full_title ?? "";
        payloadObj.meta_description = full.meta_description ?? "";

        const contentFetchedAtIso = new Date().toISOString();

        const insSql = `
          INSERT INTO F1_BULLETIN.RAW.RSS_ITEMS
            (SOURCE, FEED_URL, PAYLOAD, INGEST_ID, CONTENT_HTML, CONTENT_TEXT, CONTENT_FETCHED_AT)
          SELECT ?, ?, PARSE_JSON(?), ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM F1_BULLETIN.RAW.RSS_ITEMS
            WHERE INGEST_ID = ?
              AND PAYLOAD:"link"::string = ?
          );
        `;

        const binds = [
          t.SOURCE,
          t.FEED_URL,
          JSON.stringify(payloadObj),
          ingestId,
          full.content_html ?? "",
          full.content_text ?? "",
          contentFetchedAtIso,
          ingestId,
          urlNoQuery,
        ];

        try {
          const resIns = await executeAsync(conn, insSql, binds);
          inserted += resIns.rowsAffected;
        } catch (e) {
          console.log(JSON.stringify({ workerId, url: urlNoQuery, error: (e as any)?.message ?? String(e) }));
        }

        if (SLEEP_BETWEEN_MS > 0) await sleep(SLEEP_BETWEEN_MS);
      }
    }

    const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, (_, k) => worker(k + 1));
    await Promise.all(workers);

    console.log(
      JSON.stringify(
        {
          ok: true,
          ingestId,
          attempted,
          fetchedOk,
          inserted,
          skippedNoContent,
          skippedBadUrl,
        },
        null,
        2
      )
    );
  } finally {
    await destroyAsync(conn);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
