/** Sitemap helpers shared by the sitemap tools. */

import { sitePath } from './args.js';

/** The API sitemap resource. Counts are int64 values sent as strings. */
export interface ApiSitemap {
  path?: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: string;
  errors?: string;
  warnings?: string;
  contents?: Array<{ type?: string; submitted?: string; indexed?: string }>;
}

const count = (value: string | undefined) => (value === undefined ? 0 : Number(value));

/** Curated sitemap: numeric counts; the deprecated `indexed` count is dropped. */
export function curateSitemap(s: ApiSitemap) {
  return {
    path: s.path ?? null,
    type: s.type ?? null,
    isSitemapsIndex: s.isSitemapsIndex ?? false,
    isPending: s.isPending ?? false,
    lastSubmitted: s.lastSubmitted ?? null,
    lastDownloaded: s.lastDownloaded ?? null,
    errors: count(s.errors),
    warnings: count(s.warnings),
    contents: (s.contents ?? []).map((c) => ({
      type: c.type ?? null,
      submitted: count(c.submitted),
    })),
  };
}

/** The API path of one sitemap; the sitemap URL is a single encoded path segment. */
export const sitemapPath = (siteUrl: string, sitemapUrl: string) =>
  `${sitePath(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;

export const SITEMAP_URL_SCHEMA = {
  type: 'string',
  description: 'Absolute URL of the sitemap, e.g. https://www.example.com/sitemap.xml.',
} as const;
