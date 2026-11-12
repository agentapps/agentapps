import type { AgentApp } from '@agentapps/sdk';
import { formatHuman, type HumanProfile } from '../lib/formatters.js';
import { rahRequest } from '../lib/rah-client.js';

interface SearchHumansResponse {
  success: boolean;
  humans: HumanProfile[];
  count: number;
}

/**
 * search-humans — GET /humans.
 *
 * Public endpoint: no API key required. Searching is free.
 */
export function registerSearchHumansTool(app: AgentApp): void {
  app.tool('search-humans', {
    description:
      'Search for available humans on RentAHuman.ai. Filter by skill, hourly rate range, or name. No API key required — searching is free.',
    parameters: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          description:
            "Filter by skill (e.g., 'Photography', 'In-Person Meetings', 'Errands', 'Translation')",
        },
        name: {
          type: 'string',
          description: 'Filter by human name',
        },
        minRate: {
          type: 'number',
          description: 'Minimum hourly rate in USD',
        },
        maxRate: {
          type: 'number',
          description: 'Maximum hourly rate in USD',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 20, max: 100)',
          default: 20,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const skill = a.skill as string | undefined;
      const name = a.name as string | undefined;
      const minRate = a.minRate as number | undefined;
      const maxRate = a.maxRate as number | undefined;
      const limit = Math.min(Number(a.limit) || 20, 100);

      const data = await rahRequest<SearchHumansResponse>(ctx, '/humans', {
        publicEndpoint: true,
        query: { skill, name, minRate, maxRate, limit },
      });

      if (!data.humans || data.humans.length === 0) {
        return 'No humans found matching your criteria. Try broadening your search.';
      }

      const lines: string[] = [`Found **${data.count ?? data.humans.length}** humans:\n`];

      for (const human of data.humans) {
        lines.push(formatHuman(human));
        lines.push('---');
      }

      return lines.join('\n');
    },
  });
}
