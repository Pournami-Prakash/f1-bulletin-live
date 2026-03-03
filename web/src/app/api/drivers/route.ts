/**
 * GET /api/drivers
 *
 * Query params:
 *   driver  string (required)  e.g. "Verstappen"
 *   limit   1–200              (default: 50)
 */

import { query, normalizeRows } from "@/lib/snowflake";
import {
  ok, err, badRequest, methodNotAllowed, toErrorMessage,
  clamp, toInt, toString,
} from "@/lib/api";

interface DriverStoryRow {
  story_id: string;
  topic_cluster: string;
  story_title: string;
  latest_url: string;
  latest_source: string;
  latest_event_ts: string;
  heat_index: number;
  momentum_score: number;
  is_breaking: boolean;
  breaking_tier: string;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const driver = toString(searchParams.get("driver"));
  if (!driver) return badRequest("Missing required param: driver");

  const limit = clamp(toInt(searchParams.get("limit"), 50), 1, 200);

  const sql = `
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
    FROM F1_BULLETIN.MART.V_DRIVER_STORY_TIMELINE
    WHERE driver = ?
    ORDER BY is_breaking DESC, momentum_score DESC, latest_event_ts DESC
    LIMIT ?
  `;

  try {
    const rows = await query<Record<string, unknown>>(sql, [driver, limit], {
      schema: "MART",
      role: "F1_APP_READ_ROLE",
      warehouse: "F1_APP_WH",
    });

    const items = normalizeRows<DriverStoryRow>(rows);
    return ok(items, { count: items.length });
  } catch (e) {
    return err(toErrorMessage(e));
  }
}

export function POST() {
  return methodNotAllowed(["GET"]);
}
