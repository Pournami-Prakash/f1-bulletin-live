"use client";

import type { FeedItem } from "@/types/f1";
import { minutesAgo, getItemTs } from "@/lib/f1/time";
import { toneScore, controversyScore } from "@/lib/f1/scoring";
import { useClientClock } from "@/lib/f1/useClientClock";
import { cardClass } from "@/lib/ui";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a raw tone score to a 0–100 bar width.
 * Score range is roughly -15..+15; we centre at 50 and scale.
 */
function toneToBar(score: number): number {
  return Math.max(0, Math.min(100, 50 + score * 4));
}

/**
 * Map a raw controversy score to a 0–100 bar width.
 * Scores above 50 are "maxed out" visually.
 */
function controversyToBar(score: number): number {
  return Math.max(0, Math.min(100, score * 2));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KpiTiles({ items }: { items: FeedItem[] }) {
  const clock = useClientClock(1_000);

  // -- Pulse -----------------------------------------------------------------
  const withMins = items.map((it) => ({
    it,
    mins: minutesAgo(getItemTs(it)),
  }));
  const last60 = withMins.filter((x) => x.mins !== null && x.mins <= 60);
  const prev60 = withMins.filter((x) => x.mins !== null && x.mins > 60 && x.mins <= 120);
  const spike    = last60.length - prev60.length;
  const spikePct = prev60.length > 0
    ? Math.round((last60.length / prev60.length - 1) * 100)
    : null;

  // -- Sentiment + controversy -----------------------------------------------
  // items are pre-normalized by page.tsx — no need to decode again
  let toneTotal = 0;
  let controversyTotal = 0;
  for (const item of items) {
    const text = `${item.title ?? ""} ${item.summary ?? ""}`;
    toneTotal        += toneScore(text);
    controversyTotal += controversyScore(text);
  }

  const toneLabel        = toneTotal > 6 ? "Positive" : toneTotal < -6 ? "Negative" : "Mixed";
  const controversyLabel = controversyTotal > 40 ? "High" : controversyTotal > 18 ? "Medium" : "Low";

  // -- Story evolution -------------------------------------------------------
  const updatedCount = items.filter((x) => x.is_updated).length;
  const newsCount    = items.filter((i) => i.source_type === "news").length;
  const redditCount  = items.filter((i) => i.source_type === "reddit").length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* Pulse */}
      <div className={`${cardClass} p-5`}>
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-400 uppercase tracking-wider">Pulse (last 60m)</p>
          <p className="text-xs text-zinc-400" suppressHydrationWarning>{clock}</p>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold">{last60.length}</p>
            <p className="text-zinc-400 text-sm">posts / events</p>
          </div>
          <p className={`text-sm font-semibold ${spike >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {spike >= 0 ? "+" : ""}{spike}
            {spikePct !== null && ` (${spikePct >= 0 ? "+" : ""}${spikePct}%)`}
          </p>
        </div>
        <div className="mt-4 h-2 rounded-full bg-zinc-900 overflow-hidden">
          <div
            className="h-full bg-[rgba(225,6,0,0.9)] transition-all duration-500"
            style={{ width: `${Math.min(100, (last60.length / 20) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">Previous hour: {prev60.length} events</p>
      </div>

      {/* Sentiment */}
      <div className={`${cardClass} p-5`}>
        <p className="text-xs text-zinc-400 uppercase tracking-wider">Public Opinion</p>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold">{toneLabel}</p>
            <p className="text-zinc-400 text-sm">rule-based sentiment (v1)</p>
          </div>
          <p className="text-xs text-zinc-400">score: {toneTotal}</p>
        </div>
        <div className="mt-4 h-2 rounded-full bg-zinc-900 overflow-hidden">
          <div
            className="h-full bg-white transition-all duration-500"
            style={{ width: `${toneToBar(toneTotal)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">Next: VADER/ML sentiment from Reddit comments</p>
      </div>

      {/* Controversy */}
      <div className={`${cardClass} p-5`}>
        <p className="text-xs text-zinc-400 uppercase tracking-wider">Controversy Meter</p>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold">{controversyLabel}</p>
            <p className="text-zinc-400 text-sm">heat + intensity heuristic</p>
          </div>
          <p className="text-xs text-zinc-400">score: {controversyTotal}</p>
        </div>
        <div className="mt-4 h-2 rounded-full bg-zinc-900 overflow-hidden">
          <div
            className="h-full bg-[rgba(225,6,0,0.9)] transition-all duration-500"
            style={{ width: `${controversyToBar(controversyTotal)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">Flags spicy terms + punctuation intensity</p>
      </div>

      {/* Story Evolution */}
      <div className={`${cardClass} p-5`}>
        <p className="text-xs text-zinc-400 uppercase tracking-wider">Story Evolution</p>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold">{updatedCount}</p>
            <p className="text-zinc-400 text-sm">updated articles detected</p>
          </div>
          <p className="text-xs text-zinc-400">via Snowflake versions</p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          {[
            { label: "NEWS",    value: newsCount    },
            { label: "REDDIT",  value: redditCount  },
            { label: "UPDATED", value: updatedCount },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-zinc-400">{label}</p>
              <p className="text-white font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
