/**
 * lib/f1/grouping.ts
 * Groups a flat list of FeedItems into a day → hour timeline structure.
 */

import type { FeedItem } from "@/types/f1";
import { dayKey, hourKey } from "./time";

export type HourGroup  = [hour: string,  items: FeedItem[]];
export type DayGroup   = [day: string,   hours: HourGroup[]];
export type Timeline   = DayGroup[];

/**
 * Groups items by day (DESC) then hour (DESC).
 * Uses event_ts → published_at_raw → fetched_at as the timestamp cascade.
 */
export function groupTimeline(items: FeedItem[]): Timeline {
  const dayMap = new Map<string, Map<string, FeedItem[]>>();

  for (const item of items) {
    const ts = item.event_ts ?? item.published_at_raw ?? null;
    const d  = dayKey(ts);
    const h  = hourKey(ts);

    if (!dayMap.has(d)) dayMap.set(d, new Map());
    const hourMap = dayMap.get(d)!;

    if (!hourMap.has(h)) hourMap.set(h, []);
    hourMap.get(h)!.push(item);
  }

  return [...dayMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, hourMap]) => [
      day,
      [...hourMap.entries()]
        .sort(([a], [b]) => b.localeCompare(a)),
    ]);
}
