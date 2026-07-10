"use client";

import { useMemo, useState } from "react";
import type { FeedItem } from "@/types/f1";
import { matchEntities } from "@/lib/f1/text";
import { formatTs, getItemTs } from "@/lib/f1/time";
import { groupTimeline } from "@/lib/f1/grouping";
import { cardClass } from "@/lib/ui";
import { DRIVER_NAMES, TEAM_NAMES, TRACK_NAMES } from "@/config/f1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EventBadge = { text: string; cls: string };

const EVENT_BADGES: Record<string, EventBadge> = {
  UPDATED: { text: "UPDATED", cls: "border-red-500/30 bg-red-500/10 text-red-200" },
  NEW:     { text: "NEW",     cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" },
  REFRESH: { text: "REFRESH", cls: "border-zinc-700/40 bg-zinc-900/40 text-zinc-200" },
};

const SOURCE_BADGES: Record<string, string> = {
  news:    "bg-sky-500/15 text-sky-200 border-sky-500/30",
  reddit:  "bg-amber-500/15 text-amber-200 border-amber-500/30",
};

// Derive a stable React key from a feed item
function itemKey(it: FeedItem, idx: number): string {
  const ts = getItemTs(it) ?? "";
  return it.url ? `${it.url}::${ts}` : `fallback::${idx}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SourceBadge({ type }: { type: string }) {
  const cls = SOURCE_BADGES[type] ?? "bg-zinc-700/20 text-zinc-200 border-zinc-600/30";
  return (
    <span className={`text-[11px] px-2 py-1 rounded-full border ${cls}`}>
      {type.toUpperCase()}
    </span>
  );
}

function EventTypeBadge({ item }: { item: FeedItem }) {
  const et = (item.event_type ?? "").toUpperCase();
  const badge = EVENT_BADGES[et];
  if (!badge && !item.is_updated) return null;

  if (badge) {
    return (
      <span className={`text-[11px] px-2 py-1 rounded-full border ${badge.cls}`}>
        {badge.text}
        {et === "UPDATED" && item.rn ? ` · r${item.rn}` : ""}
      </span>
    );
  }

  // Legacy is_updated fallback (from MART view before event_type was added)
  return (
    <span className="text-[11px] px-2 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-200">
      UPDATED · v{item.versions ?? "?"}
    </span>
  );
}

function EntityTags({ item }: { item: FeedItem }) {
  const text = `${item.title ?? ""} ${item.summary ?? ""}`;
  const tags = [
    ...matchEntities(text, [...DRIVER_NAMES]),
    ...matchEntities(text, [...TEAM_NAMES]),
    ...matchEntities(text, [...TRACK_NAMES]),
  ].slice(0, 6);

  if (!tags.length) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="text-[11px] px-2 py-1 rounded-full border border-zinc-800 bg-zinc-900/40 text-zinc-200"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function FeedCard({ item, compact }: { item: FeedItem; compact: boolean }) {
  const ts    = getItemTs(item);
  const title = item.title || "(no title)";
  const type  = (item.source_type ?? "unknown").toLowerCase();

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 hover:bg-zinc-950 transition">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <SourceBadge type={type} />
          <EventTypeBadge item={item} />
          <span className="text-xs text-zinc-400">{item.source}</span>
        </div>
        <span className="text-xs text-zinc-500 shrink-0">{formatTs(ts)}</span>
      </div>

      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="block mt-2 text-lg font-semibold hover:text-[rgba(225,6,0,0.9)] transition-colors"
      >
        {title}
      </a>

      {!compact && item.summary && (
        <p className="text-zinc-300 mt-2 line-clamp-3">{item.summary}</p>
      )}

      <EntityTags item={item} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// How many cards to show per hour bucket in each density mode
const ITEMS_PER_HOUR = { expanded: 14, compact: 6 } as const;

interface TimelineProps {
  items:   FeedItem[];
  loading: boolean;
}

export default function Timeline({ items, loading }: TimelineProps) {
  const [compact,     setCompact]     = useState(false);
  const [showRefresh, setShowRefresh] = useState(true);

  const filtered = useMemo(
    () =>
      showRefresh
        ? items
        : items.filter((it) => (it.event_type ?? "").toUpperCase() !== "REFRESH"),
    [items, showRefresh]
  );

  const timeline = useMemo(() => groupTimeline(filtered), [filtered]);
  const limit    = compact ? ITEMS_PER_HOUR.compact : ITEMS_PER_HOUR.expanded;

  return (
    <div className={`${cardClass} p-6`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wider">Race Control Timeline</p>
          <p className="text-xl font-semibold mt-1">Major moments grouped by time</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setCompact((v) => !v)}
            aria-pressed={compact}
            className="text-xs px-3 py-2 rounded-full border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900"
          >
            {compact ? "Expanded view" : "Compact view"}
          </button>
          <button
            onClick={() => setShowRefresh((v) => !v)}
            aria-pressed={!showRefresh}
            className="text-xs px-3 py-2 rounded-full border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900"
          >
            {showRefresh ? "Hide refreshes" : "Show refreshes"}
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-6 space-y-10">
        {timeline.map(([day, hours]) => (
          <div key={day}>
            {/* Day divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-900" />
              <div className="text-xs text-zinc-300 border border-zinc-800 rounded-full px-3 py-1 bg-zinc-950/60">
                {day}
              </div>
              <div className="h-px flex-1 bg-zinc-900" />
            </div>

            <div className="mt-6 space-y-6">
              {hours.map(([hour, list]) => (
                <div key={hour} className="relative pl-6">
                  {/* Timeline stem */}
                  <div className="absolute left-1 top-2 bottom-2 w-px bg-zinc-900" />
                  <div className="absolute left-0 top-2 h-3 w-3 rounded-full bg-[rgba(225,6,0,0.9)] shadow-[0_0_20px_rgba(225,6,0,0.45)]" />

                  <p className="text-xs text-zinc-500 mb-3">{hour.replace("T", " ")}:00</p>

                  <div className="space-y-3">
                    {list.slice(0, limit).map((item, idx) => (
                      <FeedCard key={itemKey(item, idx)} item={item} compact={compact} />
                    ))}
                    {list.length > limit && (
                      <p className="text-xs text-zinc-500 pl-1">
                        +{list.length - limit} more in this hour
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!loading && filtered.length === 0 && (
          <p className="text-zinc-400">No items match the current filters.</p>
        )}
      </div>
    </div>
  );
}
