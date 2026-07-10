/**
 * lib/text.ts
 * Text cleaning utilities shared across routes.
 * Keeps this logic in one place so routes stay focused.
 */

// ---------------------------------------------------------------------------
// HTML stripping
// ---------------------------------------------------------------------------

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#039;": "'",
  "&#39;": "'",
  "&#32;": " ",
  "&nbsp;": " ",
  "&apos;": "'",
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&[^;]+;/g, (match) => HTML_ENTITIES[match] ?? match);
}

export function stripHtml(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Summary cleaning
// ---------------------------------------------------------------------------

export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

/**
 * FIA feeds append a taxonomy/calendar dump after the real content.
 * This removes everything from the first footer marker onwards.
 */
const FIA_FOOTER_MARKERS = [
  " FIA Formula One World Championship",
  " Formula One World Championship",
  " FIA Formula 1",
  " FIA Formula One",
  " About the FIA",
  " About Tomorrow.io",
  " SEASON ",
  " Thursday,", " Wednesday,", " Tuesday,", " Monday,",
  " Sunday,", " Saturday,", " Friday,",
];

export function cleanFiaSummary(input: string): string {
  const s = input;
  let cutAt = -1;
  for (const marker of FIA_FOOTER_MARKERS) {
    const idx = s.indexOf(marker);
    if (idx !== -1) cutAt = cutAt === -1 ? idx : Math.min(cutAt, idx);
  }
  return cutAt !== -1 ? s.slice(0, cutAt).trim() : s;
}

/**
 * Reddit RSS entries end with "submitted by /u/… [link] [comments]".
 * This strips that boilerplate.
 */
export function cleanRedditSummary(input: string): string {
  return input
    .replace(/\s*submitted by\s*\/u\/[^\s]+\s*(?:\[[^\]]*\]\s*)*\s*$/i, "")
    .replace(/\s*\[(?:link|comments?)\]\s*/gi, " ")
    .replace(/\s*\[\s*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clean a summary string based on its source type.
 */
export function cleanSummary(
  raw: string,
  sourceType: string,
  maxLen = 420
): string {
  const type = sourceType.toLowerCase();
  let s = ["reddit", "official"].includes(type) ? stripHtml(raw) : decodeHtmlEntities(raw);
  s = s.replace(/\s+/g, " ").trim();

  if (type === "official") s = cleanFiaSummary(s);
  if (type === "reddit") s = cleanRedditSummary(s);

  return truncate(s.replace(/\s+/g, " ").trim(), maxLen);
}

// ---------------------------------------------------------------------------
// RSS parsing
// ---------------------------------------------------------------------------

function getXmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m?.[1] ?? "";
}

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim();
}

function extractText(xml: string, tag: string): string {
  return decodeHtmlEntities(stripCdata(getXmlTag(xml, tag)));
}

export interface RssItem {
  title: string;
  link: string;
  summary: string;
  published_at: string;
}

export function parseRssFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // RSS 2.0
  for (const block of xml.match(/<item[\s\S]*?<\/item>/gi) ?? []) {
    const title = extractText(block, "title");
    const link = extractText(block, "link");
    if (title && link) {
      items.push({
        title,
        link,
        summary: extractText(block, "description"),
        published_at: extractText(block, "pubDate"),
      });
    }
  }

  // Atom
  for (const block of xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? []) {
    const title = extractText(block, "title");
    const linkMatch = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
    const link = decodeHtmlEntities(linkMatch?.[1] ?? "");
    if (title && link) {
      items.push({
        title,
        link,
        summary: extractText(block, "summary") || extractText(block, "content"),
        published_at: extractText(block, "published") || extractText(block, "updated"),
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Full-text extraction
// ---------------------------------------------------------------------------

export interface FullTextResult {
  content_html: string;
  content_text: string;
  full_title: string;
  meta_description: string;
}

export function extractFullText(html: string): FullTextResult {
  const fullTitle = decodeHtmlEntities(
    (html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] ?? "").trim()
  );
  const metaDescription = decodeHtmlEntities(
    (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? "").trim()
  );

  const articleHtml =
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    html;

  return {
    content_html: html,
    content_text: stripHtml(articleHtml),
    full_title: fullTitle,
    meta_description: metaDescription,
  };
}

export const EMPTY_FULL_TEXT: FullTextResult = {
  content_html: "",
  content_text: "",
  full_title: "",
  meta_description: "",
};
