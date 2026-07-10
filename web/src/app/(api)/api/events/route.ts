/**
 * GET /api/events
 *
 * Query params:
 *   source   all | news | reddit | official   (default: all)
 *   q        string full-text search           (default: "")
 *   limit    1–300                             (default: 100)
 *   hours    1–720                             (default: 168 / 7 days)
 *   cursor   opaque pagination token
 *   tier     all | P0 | P1 | P2 | P3          (default: all)
 *
 * Reads from Neon event_f1_only.
 *     - F1-relevant content only (is_f1_relevant = TRUE)
 *     - Adds priority_score, priority_tier, topic_cluster from pipeline
 *     - event_type / rn already computed by DT chain, not inline
 *     - source_type is a real column, not extracted from PAYLOAD JSON
 */

import { NextResponse } from "next/server";
import {
  err, methodNotAllowed, toErrorMessage,
  clamp, toInt, toString, toEnum,
  parseCursor, buildCursor,
} from "@/lib/api";
import { getNeonSql } from "@/lib/neon";
import type { FeedItem } from "@/types/f1";

const SOURCE_TYPES = ["all", "news", "reddit", "official"] as const;
const PRIORITY_TIERS = ["all", "P0", "P1", "P2", "P3"] as const;

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const source = toEnum(searchParams.get("source"), SOURCE_TYPES, "all");
  const tier   = toEnum(searchParams.get("tier"),   PRIORITY_TIERS, "all");
  const q      = toString(searchParams.get("q"));
  const limit  = clamp(toInt(searchParams.get("limit"), 100), 1, 300);
  const hours  = clamp(toInt(searchParams.get("hours"), 168), 1, 720);
  const cursor = parseCursor(searchParams.get("cursor"));

  const where: string[] = [];
  const binds: unknown[] = [];

  // Time window first so the query stays small.
  where.push(`e.event_ts >= NOW() - ($${binds.length + 1} || ' hours')::interval`);
  binds.push(hours);

  if (source !== "all") {
    where.push(`LOWER(e.source_type) = $${binds.length + 1}`);
    binds.push(source);
  }

  if (tier !== "all") {
    where.push(`e.priority_tier = $${binds.length + 1}`);
    binds.push(tier);
  }

  if (q) {
    where.push(`(
      e.title   ILIKE $${binds.length + 1}
      OR e.summary ILIKE $${binds.length + 2}
      OR e.source  ILIKE $${binds.length + 3}
      OR e.url     ILIKE $${binds.length + 4}
    )`);
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }

  // Keyset pagination on (event_ts DESC, content_hash DESC)
  if (cursor) {
    where.push(`(
      e.event_ts < $${binds.length + 1}::timestamptz
      OR (e.event_ts = $${binds.length + 2}::timestamptz AND e.content_hash < $${binds.length + 3})
    )`);
    binds.push(cursor.tsIso, cursor.tsIso, cursor.id);
  }

  const whereSql = where.length ? `WHERE ${where.join("\n  AND ")}` : "";

  const sql = `
    SELECT
      e.source_type,
      e.source,
      NULL::text AS feed_url,
      COALESCE(e.content_hash, e.url) AS id,
      e.title,
      e.url,
      e.summary,
      e.published_at_ts::text,
      e.event_ts::text,
      e.content_hash,
      e.event_type,
      e.rn,
      e.priority_score,
      e.priority_tier,
      e.topic_cluster,
      e.freshness_minutes AS freshness_score,
      e.is_multi_source,
      e.source_count,
      e.n_10m,
      e.n_60m,
      e.is_spike,
      e.is_f1_relevant,
      e.relevance_score,
      e.controversy_score
    FROM event_f1_only e
    ${whereSql}
    ORDER BY e.event_ts DESC, e.content_hash DESC
    LIMIT $${binds.length + 1}
  `;

  try {
    const db = getNeonSql();
    const rows = await db.query(sql, [...binds, limit]);
    const items = rows as unknown as FeedItem[];

    const nextCursor =
      items.length === limit
        ? buildCursor(items.at(-1)?.event_ts, items.at(-1)?.content_hash)
        : null;

    return NextResponse.json({
      ok:         true,
      count:      items.length,
      nextCursor: nextCursor ?? null,
      data:       items,
    });
  } catch (e) {
    return err(toErrorMessage(e));
  }
}

export function POST() {
  return methodNotAllowed(["GET"]);
}
