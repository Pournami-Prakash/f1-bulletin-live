"use client";

import type { SourceFilter } from "@/types/f1";
import { HOUR_PRESETS } from "@/config/f1";

interface Props {
  filter:           SourceFilter;
  setFilter:        (v: SourceFilter) => void;
  q:                string;
  setQ:             (v: string) => void;
  activeCluster:    string | null;
  setActiveCluster: (v: string | null) => void;
  itemsCount:       number;
  loading:          boolean;
  auto:             boolean;
  setAuto:          (v: boolean) => void;
  onRefresh:        () => void;
  hours:            number;
  setHours:         (v: number) => void;
}

const SOURCE_FILTERS: { label: string; value: SourceFilter }[] = [
  { label: "All",    value: "all"     },
  { label: "News",   value: "news"    },
  { label: "Reddit", value: "reddit"  },
];

function pill(active: boolean) {
  return `px-4 py-2 rounded-full text-sm transition border ${
    active
      ? "bg-white text-black border-white"
      : "bg-zinc-950/60 text-zinc-200 border-zinc-800 hover:bg-zinc-900"
  }`;
}

function subpill(active: boolean) {
  return `px-3 py-1.5 rounded-full text-xs transition border ${
    active
      ? "bg-zinc-200 text-black border-zinc-200"
      : "bg-zinc-950/60 text-zinc-200 border-zinc-800 hover:bg-zinc-900"
  }`;
}

export default function ControlsRow(props: Props) {
  return (
    <div className="max-w-6xl mx-auto px-6 -mt-6">
      <div className="rounded-2xl border border-zinc-900 bg-black/40 backdrop-blur p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">

          <div className="flex flex-wrap gap-3 items-center flex-1">
            {/* Source filter */}
            <div
              className="flex gap-2 p-2 rounded-full bg-zinc-950/60 border border-zinc-800"
              role="group"
              aria-label="Filter by source"
            >
              {SOURCE_FILTERS.map(({ label, value }) => (
                <button
                  key={value}
                  className={pill(props.filter === value)}
                  onClick={() => props.setFilter(value)}
                  aria-pressed={props.filter === value}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Time window */}
            <div
              className="flex gap-2 p-2 rounded-full bg-zinc-950/60 border border-zinc-800"
              role="group"
              aria-label="Time window"
            >
              <span className="text-[11px] text-zinc-400 px-2 py-1 flex items-center select-none">
                Window
              </span>
              {HOUR_PRESETS.map(({ label, h }) => (
                <button
                  key={h}
                  className={subpill(props.hours === h)}
                  onClick={() => props.setHours(h)}
                  aria-pressed={props.hours === h}
                  aria-label={`Show events from last ${label}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              value={props.q}
              onChange={(e) => props.setQ(e.target.value)}
              placeholder="Search (Russell, Red Bull, Bahrain, 2026 regs…)"
              aria-label="Search feed"
              className="flex-1 min-w-[260px] rounded-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 outline-none focus:border-zinc-600"
            />

            {/* Active cluster tag */}
            {props.activeCluster && (
              <button
                onClick={() => props.setActiveCluster(null)}
                aria-label={`Clear theme filter: ${props.activeCluster}`}
                className="text-xs border border-[rgba(225,6,0,0.35)] bg-[rgba(225,6,0,0.12)] text-red-100 rounded-full px-3 py-2 hover:bg-[rgba(225,6,0,0.18)]"
              >
                Theme: {props.activeCluster} ✕
              </button>
            )}

            {/* Item count */}
            <div
              className="text-xs text-zinc-400 border border-zinc-800 rounded-full px-3 py-2 bg-zinc-950/60"
              aria-live="polite"
              aria-label={`${props.itemsCount} items loaded`}
            >
              Items: <span className="text-white font-semibold">{props.itemsCount}</span>
            </div>
          </div>

          {/* Refresh + auto-refresh */}
          <div className="flex items-center gap-3">
            <button
              onClick={props.onRefresh}
              disabled={props.loading}
              aria-label="Refresh feed"
              className="px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-50"
            >
              {props.loading ? "Refreshing…" : "Refresh"}
            </button>

            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={props.auto}
                onChange={(e) => props.setAuto(e.target.checked)}
                aria-label="Auto-refresh every 60 seconds"
              />
              Auto (60s)
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
