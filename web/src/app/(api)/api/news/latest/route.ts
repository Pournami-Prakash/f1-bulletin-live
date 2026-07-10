/**
 * GET /api/latest
 *
 * Query params:
 *   source_type  all | news | reddit | official   (default: all)
 *   source       string  e.g. "motorsport-f1"     (default: all)
 *   q            string  full-text search          (default: "")
 *   limit        1–300                             (default: 100)
 */

import { query, normalizeRows } from "@/lib/snowflake";
import { ok, err, methodNotAllowed, toErrorMessage, clamp, toInt, toString, toEnum } from "@/lib/api";
import { cleanSummary } from "@/lib/text";

const SOURCE_TYPES = ["all", "news", "reddit", "official"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LatestRow {
  id: string;
  source: string;
  source_type: string;
  feed_url: string;
  url: string;
  title: string;
  summary: string;
  published_at_raw: string;
  event_ts: string;
  content_hash: string;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const sourceType = toEnum(searchParams.get("source_type"), SOURCE_TYPES, "all");
  const source = toString(searchParams.get("source"));
  const q = toString(searchParams.get("q"));
  const limit = clamp(toInt(searchParams.get("limit"), 100), 1, 300);

  const where: string[] = [];
  const binds: unknown[] = [];

  if (source) {
    where.push(`v.SOURCE = ?`);
    binds.push(source);
  }

  if (sourceType !== "all") {
    where.push(`LOWER(v.PAYLOAD:"source_type"::string) = ?`);
    binds.push(sourceType);
  }

  // FIA news feeds contain non-F1 content — filter it out when requested
  if (sourceType === "official" || source.toLowerCase() === "fia-news") {
    where.push(`
      (
        LOWER(v.SOURCE) <> 'fia-news'
        OR LOWER(v.TITLE) LIKE '%formula 1%'
        OR LOWER(v.TITLE) LIKE '%f1%'
        OR LOWER(v.URL)   LIKE '%formula-1%'
        OR LOWER(v.URL)   LIKE '%/f1-%'
        OR LOWER(v.PAYLOAD:"categories"::string) LIKE '%formula 1%'
      )
    `);
  }

  if (q) {
    where.push(`(v.TITLE ILIKE ? OR v.SUMMARY ILIKE ? OR v.URL ILIKE ?)`);
    const like = `%${q}%`;
    binds.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join("\n  AND ")}` : "";

  const sql = `
    SELECT
      v.ID,
      v.SOURCE,
      v.FEED_URL,
      v.URL,
      v.TITLE,
      v.SUMMARY,
      v.PUBLISHED_AT_RAW,
      v.CONTENT_HASH,
      v.PAYLOAD:"source_type"::string AS SOURCE_TYPE,
      TO_VARCHAR(
        CONVERT_TIMEZONE('UTC', COALESCE(v.CONTENT_FETCHED_AT, v.FETCHED_AT)),
        'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'
      ) AS EVENT_TS
    FROM F1_BULLETIN.MART.V_RSS_LATEST v
    ${whereSql}
    ORDER BY COALESCE(v.CONTENT_FETCHED_AT, v.FETCHED_AT) DESC, v.ID DESC
    LIMIT ?
  `;

  try {
    const rows = await query<Record<string, unknown>>(sql, [...binds, limit], {
      schema: "MART",
    });

    const items = normalizeRows<LatestRow>(rows).map((r) => ({
      ...r,
      summary: cleanSummary(r.summary ?? "", r.source_type ?? ""),
    }));

    return ok(items, { count: items.length });
  } catch (e) {
    return err(toErrorMessage(e));
  }
}

export function POST() {
  return methodNotAllowed(["GET"]);
}
