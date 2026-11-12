/**
 * Minimal Google News RSS parser — no external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  pubDate: string;
  relativeTime: string;
  relatedHeadlines: string[];
}

// ---------------------------------------------------------------------------
// Locale mapping
// ---------------------------------------------------------------------------

export interface Locale {
  hl: string;
  gl: string;
  ceid: string;
}

const LOCALE_MAP: Record<string, Locale> = {
  spain: { hl: 'es', gl: 'ES', ceid: 'ES:es' },
  es: { hl: 'es', gl: 'ES', ceid: 'ES:es' },
  us: { hl: 'en', gl: 'US', ceid: 'US:en' },
  uk: { hl: 'en', gl: 'GB', ceid: 'GB:en' },
  france: { hl: 'fr', gl: 'FR', ceid: 'FR:fr' },
  fr: { hl: 'fr', gl: 'FR', ceid: 'FR:fr' },
  germany: { hl: 'de', gl: 'DE', ceid: 'DE:de' },
  de: { hl: 'de', gl: 'DE', ceid: 'DE:de' },
  italy: { hl: 'it', gl: 'IT', ceid: 'IT:it' },
  it: { hl: 'it', gl: 'IT', ceid: 'IT:it' },
  portugal: { hl: 'pt-PT', gl: 'PT', ceid: 'PT:pt-150' },
  pt: { hl: 'pt-PT', gl: 'PT', ceid: 'PT:pt-150' },
  brazil: { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' },
  br: { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' },
  mexico: { hl: 'es-419', gl: 'MX', ceid: 'MX:es-419' },
  mx: { hl: 'es-419', gl: 'MX', ceid: 'MX:es-419' },
  japan: { hl: 'ja', gl: 'JP', ceid: 'JP:ja' },
  jp: { hl: 'ja', gl: 'JP', ceid: 'JP:ja' },
  europe: { hl: 'en', gl: 'US', ceid: 'US:en' },
  global: { hl: 'en', gl: 'US', ceid: 'US:en' },
};

export function resolveLocale(region?: string): Locale {
  if (!region) return LOCALE_MAP.global;
  return LOCALE_MAP[region.toLowerCase()] ?? LOCALE_MAP.global;
}

// ---------------------------------------------------------------------------
// RSS fetching & parsing
// ---------------------------------------------------------------------------

const GNEWS_BASE = 'https://news.google.com/rss';

function buildUrl(locale: Locale, topic?: string): string {
  const params = new URLSearchParams({ hl: locale.hl, gl: locale.gl, ceid: locale.ceid });
  if (topic) {
    return `${GNEWS_BASE}/search?q=${encodeURIComponent(topic)}&${params}`;
  }
  return `${GNEWS_BASE}?${params}`;
}

function relativeTime(pubDate: string): string {
  const diffMs = Date.now() - new Date(pubDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Extract text between XML tags. Simple regex approach — Google News RSS
 * is well-formed so this is reliable enough without a full XML parser.
 */
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`,
  );
  const m = xml.match(re);
  return (m?.[1] ?? m?.[2] ?? '').trim();
}

/**
 * Parse the source name from a Google News title.
 * Google News titles follow the pattern: "Headline - Source Name"
 */
function parseSourceFromTitle(rawTitle: string): { title: string; source: string } {
  const lastDash = rawTitle.lastIndexOf(' - ');
  if (lastDash === -1) return { title: rawTitle, source: 'Unknown' };
  return {
    title: rawTitle.slice(0, lastDash).trim(),
    source: rawTitle.slice(lastDash + 3).trim(),
  };
}

export async function fetchNews(topic?: string, region?: string, count = 5): Promise<NewsItem[]> {
  const locale = resolveLocale(region);
  const url = buildUrl(locale, topic);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'AgentApps/1.0 (RSS Reader)' },
  });

  if (!res.ok) {
    throw new Error(`Google News RSS error ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const xml = await res.text();

  // Split into <item> blocks
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null = itemRegex.exec(xml);

  while (match !== null && items.length < count) {
    const block = match[1];
    const rawTitle = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const description = extractTag(block, 'description');

    const { title, source } = parseSourceFromTitle(rawTitle);

    // The <description> contains an <ol> of related headlines from other sources.
    // Extract them as plain text for additional context.
    const relatedHeadlines = Array.from(description.matchAll(/<a[^>]*>([^<]+)<\/a>/g), (m) =>
      m[1].trim(),
    ).filter((h) => h.length > 0);

    items.push({
      title,
      source,
      url: link,
      pubDate,
      relativeTime: relativeTime(pubDate),
      relatedHeadlines,
    });

    match = itemRegex.exec(xml);
  }

  return items;
}
