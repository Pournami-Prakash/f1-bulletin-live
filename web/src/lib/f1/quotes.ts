/**
 * lib/f1/quotes.ts
 * Extracts quoted speech from feed item titles and summaries.
 * Items must be pre-normalized (HTML stripped) before being passed here.
 */

import type { FeedItem } from "@/types/f1";

export interface QuoteItem {
  who:   string;
  quote: string;
  url:   string;
}

function clean(s: unknown, fallback: string): string {
  const t = typeof s === "string" ? s.trim() : "";
  return t || fallback;
}

function isJunkQuote(text: string): boolean {
  // Reject URLs, HTML fragments, CSS, or single-word matches
  return (
    text.startsWith("http")         ||
    text.startsWith("/")            ||
    text.includes("<")              ||
    text.includes(">")              ||
    text.includes("{")              ||
    text.includes("text-align")     ||
    text.includes("class=")         ||
    /^[\w-]+$/.test(text)           || // single token — not a quote
    text.length < 12
  );
}

/**
 * Extracts up to `max` quotes from a list of normalized feed items.
 * Tries "Name: "quote"" first, falls back to any quoted phrase ≥ 12 chars.
 */
export function extractQuotes(items: FeedItem[], max = 8): QuoteItem[] {
  const quotes: QuoteItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    // Only look in title + summary — body HTML may still have junk
    const text = `${item.title ?? ""} ${item.summary ?? ""}`.trim();
    if (!text) continue;

    const url = clean(item.url, "#");

    // Pattern 1: "Name: "quoted text""
    const attributed = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*:\s*[""](.*?)[""]/);
    if (attributed?.[2]) {
      const quote = attributed[2].trim();
      if (!isJunkQuote(quote)) {
        const who = clean(attributed[1] ?? item.source, "Source");
        const key = `${who}::${quote.slice(0, 60)}`;
        if (!seen.has(key)) {
          seen.add(key);
          quotes.push({ who, quote, url });
          continue;
        }
      }
    }

    // Pattern 2: Any quoted phrase (smart quotes preferred)
    const anyQuote = text.match(/[""](.*?)[""]/);
    if (anyQuote?.[1]) {
      const quote = anyQuote[1].trim();
      if (!isJunkQuote(quote)) {
        const who = clean(item.source, "Source");
        const key = `${who}::${quote.slice(0, 60)}`;
        if (!seen.has(key)) {
          seen.add(key);
          quotes.push({ who, quote, url });
        }
      }
    }
  }

  return quotes.slice(0, max);
}
