/**
 * lib/f1/text.ts
 * Client-safe text utilities for F1 feed display.
 * HTML entity decoding is imported from lib/text.ts (single source of truth).
 */

import { decodeHtmlEntities } from "@/lib/text";

export { decodeHtmlEntities as decodeHtml };

// ---------------------------------------------------------------------------
// Stop words — extended with HTML/CSS tokens that leak from unstripped feeds
// ---------------------------------------------------------------------------

export const STOP = new Set([
  // Common English
  "the","a","an","and","or","to","of","in","on","for","with","as","at","by","from","into",
  "is","are","was","were","it","this","that","these","those","be","been","being",
  "will","would","can","could","should","may","might",
  "they","their","them","he","she","his","her","you","your","we","our","i","me","my","us",
  "after","before","during","over","under","again","new","latest","says","say","said",
  "also","just","more","one","two","first","last","has","have","had","not","but","what",
  // HTML/CSS tokens that appear when summaries aren't fully stripped
  "href","span","class","style","sport","strong","table","thead","tbody",
  "width","height","color","align","font","type","name","data","text",
  "http","https","www","com","reddit","html","head","body",
]);

// ---------------------------------------------------------------------------
// Token frequency analysis
// ---------------------------------------------------------------------------

export function topTokens(
  items: { title?: string; summary?: string }[],
  k = 12
): Array<[word: string, count: number]> {
  const counts = new Map<string, number>();

  for (const item of items) {
    const text = `${decodeHtmlEntities(item.title ?? "")} ${decodeHtmlEntities(item.summary ?? "")}`
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, "")          // strip URLs
      .replace(/<[^>]+>/g, " ")                 // strip any residual HTML tags
      .replace(/[^a-z0-9\s-]/g, " ");           // strip special chars

    for (const word of text.split(/\s+/)) {
      const w = word.trim();
      if (w.length >= 4 && !STOP.has(w)) {
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, k);
}

// ---------------------------------------------------------------------------
// Entity matching (dictionary-based, pre-NLP)
// ---------------------------------------------------------------------------

export function matchEntities(text: string, vocab: string[]): string[] {
  const lower = text.toLowerCase();
  return Array.from(
    new Set(vocab.filter((w) => lower.includes(w)))
  ).slice(0, 4);
}
