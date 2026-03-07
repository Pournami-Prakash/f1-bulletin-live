"use client";

import type { QuoteItem } from "@/lib/f1/quotes";
import { cardClass } from "@/lib/ui";

export type { QuoteItem };

export default function QuoteBoard({ quotes }: { quotes: QuoteItem[] }) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="text-xs text-zinc-400 uppercase tracking-wider">Quote Board</p>
      <p className="text-lg font-semibold mt-1">"Who said what"</p>

      <div className="mt-4 space-y-3">
        {quotes.length ? (
          quotes.map((q) => {
            // Stable key: hash of who + quote text (avoids index-based keys)
            const key = `${q.who}::${q.quote.slice(0, 40)}`;
            return (
              <a
                key={key}
                href={q.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 hover:bg-zinc-950 transition"
              >
                <p className="text-xs text-zinc-500">{q.who}</p>
                <p className="text-sm text-zinc-200 mt-1 line-clamp-3">"{q.quote}"</p>
              </a>
            );
          })
        ) : (
          <p className="text-sm text-zinc-500">
            No quotes detected yet — improves once Reddit comments are ingested.
          </p>
        )}
      </div>
    </div>
  );
}
