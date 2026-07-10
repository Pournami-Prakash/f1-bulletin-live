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

import {
  ok, err, methodNotAllowed, toErrorMessage,
  clamp, toInt, toString, toEnum,
} from "@/lib/api";
import { getNeonSql } from "@/lib/neon";
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
  where.push(`event_ts >= NOW() - ($${binds.length + 1} || ' hours')::interval`);
  binds.push(hours);

  if (source !== "all") {
    where.push(`source_type = $${binds.length + 1}`);
    binds.push(source);
  }

  if (q) {
    where.push(`(title ILIKE $${binds.length + 1} OR summary ILIKE $${binds.length + 2} OR source ILIKE $${binds.length + 3} OR url ILIKE $${binds.length + 4})`);
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // source_type is derived inline because V_EVENT_STREAM doesn't store it
  // as a clean column — it's inferred from url/source text.
  const sql = `
    SELECT
      COALESCE(content_hash, url) AS id,
      source_type,
      source,
      NULL::text AS feed_url,
      title,
      url,
      summary,
      published_at_ts::text,
      event_ts::text,
      content_hash,
      event_type,
      rn
    FROM event_f1_only
    ${whereSql}
    ORDER BY event_ts DESC NULLS LAST
    LIMIT $${binds.length + 1}
  `;

  try {
    const db = getNeonSql();
    const items = await db.query(sql, [...binds, limit]) as unknown as FeedItem[];
    return ok(items, { count: items.length });
  } catch (e) {
    return err(toErrorMessage(e));
  }
}

export function POST() {
  return methodNotAllowed(["GET"]);
}
