/**
 * GET /api/feed
 *
 * Reads from MART.V_EVENT_STREAM — the pre-aggregated MART view.
 * Simpler/faster than /api/events (no cursor pagination, no RAW layer).
 * Used by the main feed display when you want clean, deduplicated data.
 *
 * Query params:
 *   source   all | news | reddit   (default: all)
 *   q        full-text search      (default: "")
 *   limit    1–500                 (default: 200)
 *   hours    1–720                 (default: 168 / 7 days)
 */

import { query, normalizeRows } from "@/lib/snowflake";
import {
  ok, err, methodNotAllowed, toErrorMessage,
  clamp, toInt, toString, toEnum,
} from "@/lib/api";
import type { FeedItem } from "@/types/f1";

const SOURCE_TYPES = ["all", "news", "reddit"] as const;

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const source = toEnum(searchParams.get("source"), SOURCE_TYPES, "all");
  const q      = toString(searchParams.get("q"));
  const limit  = clamp(toInt(searchParams.get("limit"), 200), 1, 500);
  const hours  = clamp(toInt(searchParams.get("hours"), 168), 1, 720);

  const where: string[] = [];
  const binds: unknown[] = [];

  // Time window first — keeps the Snowflake scan small
  where.push(`t.fetched_at >= DATEADD('hour', -?, CURRENT_TIMESTAMP())`);
  binds.push(hours);

  if (source !== "all") {
    where.push(`t.source_type = ?`);
    binds.push(source);
  }

  if (q) {
    where.push(`(t.title ILIKE ? OR t.summary ILIKE ? OR t.source ILIKE ? OR t.url ILIKE ?)`);
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // source_type is derived inline because V_EVENT_STREAM doesn't store it
  // as a clean column — it's inferred from url/source text.
  const sql = `
    SELECT
      t.source_type,
      t.source,
      t.title,
      t.url,
      t.summary,
      t.published_at_ts,
      t.fetched_at,
      t.content_hash,
      t.event_type,
      t.rn,
      COALESCE(t.published_at_ts, t.fetched_at) AS event_ts
    FROM (
      SELECT
        LOWER(
          CASE
            WHEN (url ILIKE '%reddit.com%' OR source ILIKE '%reddit%') THEN 'reddit'
            ELSE 'news'
          END
        ) AS source_type,
        source,
        title,
        url,
        summary,
        published_at_ts,
        fetched_at,
        content_hash,
        event_type,
        rn
      FROM F1_BULLETIN.MART.V_EVENT_STREAM
    ) t
    ${whereSql}
    ORDER BY COALESCE(t.fetched_at, t.published_at_ts) DESC
    LIMIT ?
  `;

  try {
    const rows  = await query<Record<string, unknown>>(sql, [...binds, limit]);
    const items = normalizeRows<FeedItem>(rows);
    return ok(items, { count: items.length });
  } catch (e) {
    return err(toErrorMessage(e));
  }
}

export function POST() {
  return methodNotAllowed(["GET"]);
}
