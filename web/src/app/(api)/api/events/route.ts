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
 * v3: Reads from MART.V_EVENT_F1_ONLY instead of RAW.RSS_ITEMS.
 *     - F1-relevant content only (is_f1_relevant = TRUE)
 *     - Adds priority_score, priority_tier, topic_cluster from pipeline
 *     - event_type / rn already computed by DT chain, not inline
 *     - source_type is a real column, not extracted from PAYLOAD JSON
 */

import { NextResponse } from "next/server";
import { query, normalizeRows } from "@/lib/snowflake";
import {
  err, methodNotAllowed, toErrorMessage,
  clamp, toInt, toString, toEnum,
  parseCursor, buildCursor,
} from "@/lib/api";
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

  // Time window — always first for scan efficiency
  where.push(`e.event_ts >= DATEADD('hour', -?, CURRENT_TIMESTAMP())`);
  binds.push(hours);

  if (source !== "all") {
    // source_type is a real column in V_EVENT_F1_ONLY (not extracted from PAYLOAD)
    where.push(`LOWER(e.source_type) = ?`);
    binds.push(source);
  }

  if (tier !== "all") {
    where.push(`e.priority_tier = ?`);
    binds.push(tier);
  }

  if (q) {
    where.push(`(
      e.title   ILIKE ?
      OR e.summary ILIKE ?
      OR e.source  ILIKE ?
      OR e.url     ILIKE ?
    )`);
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }

  // Keyset pagination on (event_ts DESC, content_hash DESC)
  if (cursor) {
    where.push(`(
      e.event_ts < TO_TIMESTAMP_NTZ(?)
      OR (e.event_ts = TO_TIMESTAMP_NTZ(?) AND e.content_hash < ?)
    )`);
    binds.push(cursor.tsIso, cursor.tsIso, cursor.id);
  }

  const whereSql = where.length ? `WHERE ${where.join("\n  AND ")}` : "";

  const sql = `
    SELECT
      e.source_type,
      e.source,
      e.title,
      e.url,
      e.summary,
      e.published_at_ts,
      e.event_ts,
      e.content_hash,
      e.event_type,
      e.rn,
      e.priority_score,
      e.priority_tier,
      e.topic_cluster,
      e.freshness_score,
      e.is_multi_source,
      e.source_count,
      e.n_10m,
      e.n_60m,
      e.is_spike,
      e.is_f1_relevant,
      e.relevance_score,
      e.controversy_score
    FROM F1_BULLETIN.MART.V_EVENT_F1_ONLY e
    ${whereSql}
    ORDER BY e.event_ts DESC, e.content_hash DESC
    LIMIT ?
  `;

  try {
    const rows  = await query<Record<string, unknown>>(sql, [...binds, limit], {
      schema:    "MART",
      role:      "F1_APP_READ_ROLE",
      warehouse: "F1_APP_WH",
    });

    const items = normalizeRows<FeedItem>(rows);

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