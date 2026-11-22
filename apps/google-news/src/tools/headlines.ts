/**
 * google_news_headlines — fetch today's top headlines from Google News RSS.
 */

import type { AgentApp } from '@agentapps/sdk';
import { fetchNews } from '../rss.js';

export function registerHeadlinesTool(app: AgentApp): void {
  app.tool('headlines', {
    description:
      'Get the latest news headlines from Google News. Optionally filter by topic (e.g. "technology", "sports", "AI") and/or region (e.g. "Spain", "US", "France", "Europe").',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'News topic or search query (e.g. "artificial intelligence", "climate change", "sports")',
        },
        region: {
          type: 'string',
          description:
            'Country or region for localized news (e.g. "Spain", "US", "France", "Germany", "UK", "Europe")',
        },
        count: {
          type: 'number',
          description: 'Number of headlines to return (default: 5, max: 15)',
        },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const topic = (args.topic as string) ?? '';
      const region = (args.region as string) ?? '';
      const count = Math.min(Math.max((args.count as number) ?? 5, 1), 15);

      ctx.log('info', `Fetching headlines`, {
        topic: topic || 'general',
        region: region || 'global',
        count,
      });

      const items = await fetchNews(topic || undefined, region || undefined, count);

      const formatted = items
        .map((item, i) => {
          let line = `${i + 1}. **${item.title}** (${item.source}, ${item.relativeTime})`;
          if (item.relatedHeadlines.length > 0) {
            line += `\n   Also: ${item.relatedHeadlines.join(' · ')}`;
          }
          return line;
        })
        .join('\n');

      return {
        headlines: items,
        formatted,
        count: items.length,
        topic: topic || 'general',
        region: region || 'global',
      };
    },
  });
}
