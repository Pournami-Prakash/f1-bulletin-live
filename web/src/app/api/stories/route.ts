/**
 * GET /api/stories
 *
 * Query params:
 *   cluster  all | TEAM_NEWS | DRIVER_NEWS | ...   (default: all)
 *   q        string full-text search                (default: "")
 *   hours    1–720                                  (default: 168 / 7 days)
 *   limit    1–200                                  (default: 100)
 */

import { query, normalizeRows } from "@/lib/snowflake";
import {
  ok, err, methodNotAllowed, toErrorMessage,
  clamp, toInt, toString,
} from "@/lib/api";

interface StoryRow {
  story_id: string;
  topic_cluster: string;
  story_title: string;
  latest_url: string;
  latest_source: string;
  latest_event_ts: string;
  first_seen_at: string;
  last_seen_at: string;
  events_count: number;
  sources_count: number;
  updates_count: number;
  max_priority_score: number;
  best_priority_tier: string;
  driver: string | null;
  heat_index: number;
  momentum_score: number;
  is_breaking: boolean;
  breaking_tier: string;
  merge_key: string;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const cluster = toString(searchParams.get("cluster")) || "all";
  const q = toString(searchParams.get("q"));
  const hours = clamp(toInt(searchParams.get("hours"), 168), 1, 720);
  const limit = clamp(toInt(searchParams.get("limit"), 100), 1, 200);

  const where: string[] = [];
  const binds: unknown[] = [];

  where.push(`s.latest_event_ts >= DATEADD('hour', ?, CURRENT_TIMESTAMP())`);
  binds.push(-hours);

  if (cluster !== "all") {
    where.push(`s.topic_cluster = ?`);
    binds.push(cluster);
  }

  if (q) {
    where.push(`(
      s.story_title   ILIKE ?
      OR s.latest_source ILIKE ?
      OR s.latest_url    ILIKE ?
    )`);
    const like = `%${q}%`;
    binds.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      s.story_id,
      s.topic_cluster,
      s.story_title,
      s.latest_url,
      s.latest_source,
      s.latest_event_ts,
      s.first_seen_at,
      s.last_seen_at,
      s.events_count,
      s.sources_count,
      s.updates_count,
      s.max_priority_score,
      s.best_priority_tier,
      s.driver,
      s.heat_index,
      s.momentum_score,
      s.is_breaking,
      s.breaking_tier,
      s.merge_key
    FROM F1_BULLETIN.MART.STORY_TIMELINE_DT s
    ${whereSql}
    ORDER BY s.is_breaking DESC, s.momentum_score DESC, s.latest_event_ts DESC
    LIMIT ?
  `;

  try {
    const rows = await query<Record<string, unknown>>(sql, [...binds, limit], {
      schema: "MART",
      role: "F1_APP_READ_ROLE",
      warehouse: "F1_APP_WH",
    });

    const items = normalizeRows<StoryRow>(rows);
    return ok(items, {
      count: items.length,
    });
  } catch (e) {
    return err(toErrorMessage(e));
  }
}

export function POST() {
  return methodNotAllowed(["GET"]);
}
