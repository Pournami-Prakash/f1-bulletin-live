"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ApiResponse, FeedItem, SourceFilter } from "@/types/f1";

import HeaderBar from "@/components/f1/HeaderBar";
import ControlsRow from "@/components/f1/ControlsRow";
import KpiTiles from "@/components/f1/KpiTiles";
import Timeline from "@/components/f1/Timeline";
import TrendingPanel from "@/components/f1/TrendingPanel";
import QuoteBoard from "@/components/f1/QuoteBoard";
import NarrativeClusters from "@/components/f1/NarrativeClusters";

import { topTokens, matchEntities } from "@/lib/f1/text";
import { extractQuotes } from "@/lib/f1/quotes";
import { cleanSummary, decodeHtmlEntities } from "@/lib/text";
import { DRIVER_NAMES, TEAM_NAMES, DEFAULT_HOURS, DEFAULT_LIMIT, AUTO_REFRESH_MS } from "@/config/f1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fully normalizes a raw FeedItem from the API:
 * - decodes HTML entities in titles
 * - strips HTML + cleans summaries based on source_type
 * - fills in safe fallbacks
 */
function normalizeItem(it: FeedItem): FeedItem {
  const sourceType = (it.source_type ?? "news").toLowerCase();
  return {
    ...it,
    title:   decodeHtmlEntities(it.title   ?? ""),
    summary: cleanSummary(it.summary ?? "", sourceType),
    source:  it.source || "Source",
    url:     it.url    || "#",
  };
}

function countEntities(items: FeedItem[], vocab: readonly string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    for (const name of matchEntities(text, [...vocab])) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort(([, a], [, b]) => b - a).slice(0, 6);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Page() {
  const [items,         setItems]         = useState<FeedItem[]>([]);
  const [filter,        setFilter]        = useState<SourceFilter>("all");
  const [q,             setQ]             = useState("");
  const [debouncedQ,    setDebouncedQ]    = useState("");
  const [hours,         setHours]         = useState(DEFAULT_HOURS);
  const [auto,          setAuto]          = useState(false);
  const [nextCursor,    setNextCursor]    = useState<string | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [fetchError,    setFetchError]    = useState<string | null>(null);
  const [lastOkAt,      setLastOkAt]      = useState<number | null>(null);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  // Base URL from current filters (no cursor)
  const baseUrl = useMemo(() => {
    const p = new URLSearchParams({
      source: filter,
      limit:  String(DEFAULT_LIMIT),
      hours:  String(hours),
    });
    if (debouncedQ) p.set("q", debouncedQ);
    return `/api/events?${p.toString()}`;
  }, [filter, debouncedQ, hours]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res  = await fetch(baseUrl, { cache: "no-store", signal: ctrl.signal });
      const body = await res.json() as ApiResponse<FeedItem[]>;

      if (!res.ok || !body.ok) {
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      setItems((body.data ?? []).map(normalizeItem));
      setNextCursor((body as any).nextCursor ?? null);
      setLastOkAt(Date.now());
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setFetchError("Could not fetch latest data. Showing last results.");
      }
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);

    try {
      const url  = `${baseUrl}&cursor=${encodeURIComponent(nextCursor)}`;
      const res  = await fetch(url, { cache: "no-store" });
      const body = await res.json() as ApiResponse<FeedItem[]>;

      if (!res.ok || !body.ok) {
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      setItems((prev) => [...prev, ...(body.data ?? []).map(normalizeItem)]);
      setNextCursor((body as any).nextCursor ?? null);
    } catch (e) {
      setFetchError((e as Error).message || "Load more failed");
    } finally {
      setLoadingMore(false);
    }
  }, [baseUrl, nextCursor]);

  useEffect(() => { loadFirstPage(); }, [loadFirstPage]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(loadFirstPage, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [auto, loadFirstPage]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const visibleItems = useMemo(() => {
    if (!activeCluster) return items;
    const needle = activeCluster.toLowerCase();
    return items.filter((it) =>
      `${it.title} ${it.summary}`.toLowerCase().includes(needle)
    );
  }, [items, activeCluster]);

  const topics     = useMemo(() => topTokens(visibleItems, 12),    [visibleItems]);
  const quotes     = useMemo(() => extractQuotes(visibleItems),     [visibleItems]);
  const topDrivers = useMemo(() => countEntities(visibleItems, DRIVER_NAMES), [visibleItems]);
  const topTeams   = useMemo(() => countEntities(visibleItems, TEAM_NAMES),   [visibleItems]);

  const lastOkLabel = useMemo(
    () => lastOkAt ? new Date(lastOkAt).toLocaleTimeString() : null,
    [lastOkAt]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="min-h-screen bg-black text-white">
      <HeaderBar />

      <ControlsRow
        filter={filter}        setFilter={setFilter}
        q={q}                  setQ={setQ}
        activeCluster={activeCluster} setActiveCluster={setActiveCluster}
        itemsCount={items.length}
        loading={loading}
        auto={auto}            setAuto={setAuto}
        onRefresh={loadFirstPage}
        hours={hours}          setHours={setHours}
      />

      <div className="max-w-6xl mx-auto px-6 pt-6">
        {fetchError && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-200 flex items-center justify-between gap-3">
            <span>⚠ {fetchError}</span>
            {lastOkLabel && (
              <span className="text-xs text-amber-200/70">Last good load: {lastOkLabel}</span>
            )}
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main column */}
        <div className="lg:col-span-8 space-y-6">
          <KpiTiles items={items} />
          <Timeline items={visibleItems} loading={loading} />

          <div className="flex items-center justify-center pt-2">
            {nextCursor ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs px-4 py-2 rounded-full border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : (
              <p className="text-xs text-zinc-500">No more results.</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <TrendingPanel
            topics={topics}
            topDrivers={topDrivers}
            topTeams={topTeams}
          />
          <QuoteBoard quotes={quotes} />
          <NarrativeClusters
            topics={topics}
            activeCluster={activeCluster}
            setActiveCluster={setActiveCluster}
          />
        </div>
      </div>
    </main>
  );
}
