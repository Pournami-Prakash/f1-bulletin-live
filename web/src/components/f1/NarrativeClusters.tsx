"use client";

import { cardClass, cn } from "@/lib/ui";

interface Props {
  topics:           [string, number][];
  activeCluster:    string | null;
  setActiveCluster: (v: string | null) => void;
}

export default function NarrativeClusters({ topics, activeCluster, setActiveCluster }: Props) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-xs text-zinc-400 uppercase tracking-wider">Narrative Clusters</p>
      <p className="text-lg font-semibold mt-1">Conversation themes</p>

      <div className="mt-4 grid grid-cols-1 gap-3">
        {topics.slice(0, 6).map(([word, count]) => {
          const isActive = activeCluster === word;
          return (
            <button
              key={word}
              onClick={() => setActiveCluster(isActive ? null : word)}
              aria-pressed={isActive}
              className={cn(
                "text-left rounded-xl border bg-zinc-950/60 p-4 hover:bg-zinc-950 transition",
                isActive
                  ? "border-[rgba(225,6,0,0.6)] shadow-[0_0_18px_rgba(225,6,0,0.18)]"
                  : "border-zinc-800"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{word}</span>
                <span className="text-xs text-zinc-400">{count} mentions</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {isActive ? "Click to clear filter" : "Click to filter timeline"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
