/**
 * GET /api/stories
 * Neon-backed story timeline API.
 *
 * Query params:
 *   cluster  all | TEAM_NEWS | DRIVER_NEWS | ...   (default: all)
 *   q        string full-text search                (default: "")
 *   hours    1–720                                  (default: 720 / 30 days)
 *   limit    1–200                                  (default: 100)
 */

import { neon } from "@neondatabase/serverless";
import {
  ok, err, methodNotAllowed, toErrorMessage,
  clamp, toInt, toString,
} from "@/lib/api";

interface StoryRow {
  story_id: string;
  topic_cluster: string | null;
  story_title: string;
  latest_url: string | null;
  latest_source: string | null;
  latest_event_ts: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  events_count: number;
  sources_count: number;
  updates_count: number;
  max_priority_score: number | null;
  best_priority_tier: string | null;
  driver: string | null;
  heat_index: number | null;
  momentum_score: number | null;
  is_breaking: boolean;
  breaking_tier: string | null;
  merge_key: string | null;
}

export const revalidate = 120;

export async function GET(req: Request) {
  if (!process.env.NEON_DATABASE_URL) {
    return err("NEON_DATABASE_URL not configured", 503, "CONFIG_ERROR");
  }

  const { searchParams } = new URL(req.url);
  const cluster = toString(searchParams.get("cluster")) || "all";
  const q = toString(searchParams.get("q"));
  const hours = clamp(toInt(searchParams.get("hours"), 720), 1, 720);
  const limit = clamp(toInt(searchParams.get("limit"), 100), 1, 200);

  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const rows = await sql`
      SELECT
        story_id,
        topic_cluster,
        story_title,
        latest_url,
        latest_source,
        latest_event_ts,
        first_seen_at,
        last_seen_at,
        events_count,
        sources_count,
        updates_count,
        max_priority_score,
        best_priority_tier,
        driver,
        heat_index,
        momentum_score,
        is_breaking,
        breaking_tier,
        merge_key
      FROM story_timeline
      WHERE latest_event_ts >= NOW() - (${hours} || ' hours')::interval
        AND (${cluster} = 'all' OR topic_cluster = ${cluster})
        AND (
          ${q} = ''
          OR story_title ILIKE ${`%${q}%`}
          OR COALESCE(latest_source, '') ILIKE ${`%${q}%`}
          OR COALESCE(latest_url, '') ILIKE ${`%${q}%`}
        )
      ORDER BY is_breaking DESC, COALESCE(momentum_score, 0) DESC, latest_event_ts DESC
      LIMIT ${limit}
    `;

    const items = rows as unknown as StoryRow[];
    return ok(items, { count: items.length });
  } catch (e) {
    return err(toErrorMessage(e));
  }
}

export function POST() {
  return methodNotAllowed(["GET"]);
}
