import type { AgentApp } from '@agentapps/sdk';
import { formatHuman, type HumanProfile } from '../lib/formatters.js';
import { rahRequest } from '../lib/rah-client.js';

interface GetHumanResponse {
  success: boolean;
  human: HumanProfile & {
    wallets?: Record<string, string>;
    bio?: string;
    availability?: Record<string, unknown>;
  };
}

/**
 * get-human — GET /humans/{humanId}.
 *
 * Public endpoint: no API key required.
 */
export function registerGetHumanTool(app: AgentApp): void {
  app.tool('get-human', {
    description:
      'Get the full profile of a specific human including skills, availability, hourly rate, location, rating, and payment wallet addresses.',
    parameters: {
      type: 'object',
      properties: {
        humanId: {
          type: 'string',
          description: "The human's profile ID",
        },
      },
      required: ['humanId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { humanId } = args as { humanId: string };
      if (!humanId) throw new Error('humanId is required');

      const data = await rahRequest<GetHumanResponse>(
        ctx,
        `/humans/${encodeURIComponent(humanId)}`,
        { publicEndpoint: true },
      );

      const h = data.human;
      const lines: string[] = [formatHuman(h)];

      if (h.bio) {
        lines.push(`\n**Bio:**\n${h.bio}`);
      }

      if (h.expertise && h.expertise.length > 0) {
        lines.push(`\n**Expertise:** ${h.expertise.join(', ')}`);
      }

      if (h.availability && Object.keys(h.availability).length > 0) {
        lines.push('\n**Availability:**');
        for (const [day, slots] of Object.entries(h.availability)) {
          lines.push(`  ${day}: ${JSON.stringify(slots)}`);
        }
      }

      if (h.wallets && Object.keys(h.wallets).length > 0) {
        lines.push('\n**Payment Wallets:**');
        for (const [chain, address] of Object.entries(h.wallets)) {
          lines.push(`  ${chain}: \`${address}\``);
        }
      }

      return lines.join('\n');
    },
  });
}
