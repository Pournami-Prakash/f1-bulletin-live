"use client";

import { cardClass } from "@/lib/ui";

interface Props {
  /** Pre-computed from page.tsx — do not recompute here. */
  topics:     [string, number][];
  topDrivers: [string, number][];
  topTeams:   [string, number][];
}

export default function TrendingPanel({ topics, topDrivers, topTeams }: Props) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-xs text-zinc-400 uppercase tracking-wider">Trending Now</p>
      <p className="text-lg font-semibold mt-1">Topics · Drivers · Teams</p>

      {/* Topics */}
      <div className="mt-4">
        <p className="text-xs text-zinc-500 mb-2">Top Topics</p>
        <div className="flex flex-wrap gap-2">
          {topics.map(([word, count]) => (
            <span
              key={word}
              className="text-xs px-3 py-1 rounded-full border border-zinc-800 bg-zinc-950/60"
            >
              {word} <span className="text-zinc-400">×{count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Drivers + Teams */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <EntityList label="Drivers" entries={topDrivers} />
        <EntityList label="Teams"   entries={topTeams}   />
      </div>
    </div>
  );
}

function EntityList({ label, entries }: { label: string; entries: [string, number][] }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-xs text-zinc-500 mb-2">{label}</p>
      {entries.length ? (
        <ul className="space-y-2">
          {entries.map(([name, count]) => (
            <li key={name} className="flex items-center justify-between text-sm">
              <span className="capitalize">{name}</span>
              <span className="text-zinc-400">{count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">No hits yet</p>
      )}
    </div>
  );
}
