/**
 * lib/f1/scoring.ts
 * Lightweight client-side sentiment heuristics.
 * Used for real-time UI indicators before MART sentiment tables are populated.
 *
 * NOTE: These are intentionally simple.
 *  Proper sentiment lives in MART.SENTIMENT_DAILY (computed by Python/VADER).
 */

const POSITIVE_SIGNALS = [
  "great","good","love","fast","quick","strong","impressive",
  "win","wins","top","excited","happy","best","clean","fresh",
];

const NEGATIVE_SIGNALS = [
  "bad","slow","awful","hate","washed","terrible","worse","worst",
  "problem","issue","off pace","struggle",
];

const CONTROVERSY_SIGNALS = [
  "cheat","cheating","fraud","robbed","stewards","penalty",
  "ban","illegal","controversy","scandal","rigged",
];

/**
 * Returns a simple polarity score.
 * Positive = good sentiment, Negative = bad sentiment.
 */
export function toneScore(text: string): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const word of POSITIVE_SIGNALS) if (t.includes(word)) score += 1;
  for (const word of NEGATIVE_SIGNALS) if (t.includes(word)) score -= 1;
  return score;
}

/**
 * Returns a controversy score (higher = more heated).
 * Used for the 🔥 / ⚡ indicators in the feed.
 */
export function controversyScore(text: string): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const word of CONTROVERSY_SIGNALS) if (t.includes(word)) score += 2;
  // Exclamation marks amplify heat (capped to avoid gaming)
  score += Math.min((text.match(/!/g) ?? []).length, 5);
  return score;
}
