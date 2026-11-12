import type { AgentApp } from '@agentapps/sdk';
import { type Args, optionalString, parseHttpUrl, parseSiteUrl } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { READ } from './annotations.js';

const MAX_REFERRING_URLS = 20;

interface Issue {
  issueMessage?: string;
  severity?: string;
}

interface InspectResponse {
  inspectionResult?: {
    inspectionResultLink?: string;
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      lastCrawlTime?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      userCanonical?: string;
      crawledAs?: string;
      sitemap?: string[];
      referringUrls?: string[];
    };
    ampResult?: {
      verdict?: string;
      ampUrl?: string;
      indexingState?: string;
      issues?: Issue[];
    };
    mobileUsabilityResult?: {
      verdict?: string;
      issues?: Array<{ issueType?: string; message?: string }>;
    };
    richResultsResult?: {
      verdict?: string;
      detectedItems?: Array<{
        richResultType?: string;
        items?: Array<{ name?: string; issues?: Issue[] }>;
      }>;
    };
  };
}

const issueText = (i: Issue) => `${i.severity ?? 'ISSUE'}: ${i.issueMessage ?? ''}`.trim();

export function registerInspectUrlTool(app: AgentApp): void {
  app.tool('inspect-url', {
    description:
      "Inspect one URL with Search Console's URL Inspection: Google's indexed version of the " +
      'page, not a live test. Returns { verdict (PASS, NEUTRAL, FAIL), coverageState (e.g. ' +
      '"Submitted and indexed", "Crawled - currently not indexed"), indexingState, ' +
      'robotsTxtState, pageFetchState, lastCrawlTime, crawledAs, googleCanonical, ' +
      'userCanonical, sitemaps, referringUrls, richResults, amp, inspectionResultLink }. The URL ' +
      'must belong to siteUrl. Quota: about 2,000 inspections per property per day and 600 per ' +
      'minute, so inspect a handful of URLs, not a whole site.',
    parameters: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Property exactly as list-sites returns it (sc-domain:... or https://.../).',
        },
        url: {
          type: 'string',
          description: 'Absolute URL of the page to inspect, inside the property.',
        },
        languageCode: {
          type: 'string',
          description: 'BCP-47 language for the issue messages (default en-US).',
        },
      },
      required: ['siteUrl', 'url'],
    },
    // A POST, but it only reads Google's index data: nothing is changed.
    annotations: READ,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const siteUrl = parseSiteUrl(a.siteUrl);
      const url = parseHttpUrl('url', a.url);
      const languageCode = optionalString('languageCode', a.languageCode);

      const data = await apiRequest<InspectResponse>(
        'POST',
        '/v1/urlInspection/index:inspect',
        ctx,
        {
          body: { inspectionUrl: url, siteUrl, ...(languageCode ? { languageCode } : {}) },
        },
      );
      const result = data?.inspectionResult ?? {};
      const index = result.indexStatusResult ?? {};
      const referring = index.referringUrls ?? [];
      const rich = result.richResultsResult;
      const amp = result.ampResult;
      const mobile = result.mobileUsabilityResult;
      return {
        url,
        siteUrl,
        verdict: index.verdict ?? null,
        coverageState: index.coverageState ?? null,
        indexingState: index.indexingState ?? null,
        robotsTxtState: index.robotsTxtState ?? null,
        pageFetchState: index.pageFetchState ?? null,
        lastCrawlTime: index.lastCrawlTime ?? null,
        crawledAs: index.crawledAs ?? null,
        googleCanonical: index.googleCanonical ?? null,
        userCanonical: index.userCanonical ?? null,
        sitemaps: index.sitemap ?? [],
        referringUrls: referring.slice(0, MAX_REFERRING_URLS),
        referringUrlCount: referring.length,
        ...(rich
          ? {
              richResults: {
                verdict: rich.verdict ?? null,
                types: (rich.detectedItems ?? []).map((d) => ({
                  type: d.richResultType ?? 'unknown',
                  items: d.items?.length ?? 0,
                  issues: [
                    ...new Set((d.items ?? []).flatMap((i) => (i.issues ?? []).map(issueText))),
                  ].slice(0, 20),
                })),
              },
            }
          : {}),
        ...(amp
          ? {
              amp: {
                verdict: amp.verdict ?? null,
                ampUrl: amp.ampUrl ?? null,
                indexingState: amp.indexingState ?? null,
                issues: (amp.issues ?? []).map(issueText).slice(0, 20),
              },
            }
          : {}),
        ...(mobile
          ? {
              mobileUsability: {
                verdict: mobile.verdict ?? null,
                issues: (mobile.issues ?? [])
                  .map((i) => i.message ?? i.issueType ?? '')
                  .slice(0, 20),
              },
            }
          : {}),
        inspectionResultLink: result.inspectionResultLink ?? null,
      };
    },
  });
}
