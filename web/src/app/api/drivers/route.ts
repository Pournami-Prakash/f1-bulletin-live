/**
 * GET /api/drivers
 * Neon-backed driver story endpoint.
 *
 * Query params:
 *   driver  string (required)  e.g. "Verstappen"
 *   limit   1–200              (default: 50)
 */

import { neon } from "@neondatabase/serverless";
import {
  ok, err, badRequest, methodNotAllowed, toErrorMessage,
  clamp, toInt, toString,
} from "@/lib/api";

interface DriverStoryRow {
  story_id: string;
  topic_cluster: string | null;
  story_title: string;
  latest_url: string | null;
  latest_source: string | null;
  latest_event_ts: string;
  heat_index: number | null;
  momentum_score: number | null;
  is_breaking: boolean;
  breaking_tier: string | null;
}

export const revalidate = 120;

export async function GET(req: Request) {
  if (!process.env.NEON_DATABASE_URL) {
    return err("NEON_DATABASE_URL not configured", 503, "CONFIG_ERROR");
  }

  const { searchParams } = new URL(req.url);
  const driver = toString(searchParams.get("driver"));
  if (!driver) return badRequest("Missing required param: driver");

  const limit = clamp(toInt(searchParams.get("limit"), 50), 1, 200);

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
        heat_index,
        momentum_score,
        is_breaking,
        breaking_tier
      FROM v_driver_story_timeline
      WHERE LOWER(driver) = LOWER(${driver})
      ORDER BY is_breaking DESC, COALESCE(momentum_score, 0) DESC, latest_event_ts DESC
      LIMIT ${limit}
    `;

    return ok(rows as unknown as DriverStoryRow[], { count: rows.length });
  } catch (e) {
    return err(toErrorMessage(e));
  }
}

export function POST() {
  return methodNotAllowed(["GET"]);
}
