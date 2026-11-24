import type { AgentApp } from '@agentapps/sdk';
import { apiRequest } from '../lib/client.js';
import type { Envelope } from '../lib/posts.js';

interface Brand {
  id?: number;
  label?: string;
  timezone?: string;
  networksData?: Record<string, unknown> | null;
}

export function registerListBrandsTool(app: AgentApp): void {
  /** @spec METRICOOL-REQ-3 */
  app.tool('list-brands', {
    description:
      'List the brands of the Metricool account. Returns { brands: [{ id, label, timezone, networks: [{ network, handle }] }] }. Every other tool needs a brand id; timezone is the one to pass with dates; networks are the ones connected to the brand ("twitter" is X, "gbp" is Google Business Profile).',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const answer = await apiRequest<Envelope<Brand[]>>('GET', '/v2/settings/brands', ctx);
      const brands = (Array.isArray(answer?.data) ? answer.data : []).map((brand) => ({
        id: brand.id ?? null,
        label: brand.label ?? '',
        timezone: brand.timezone ?? null,
        // networksData has one key per network ("instagramData"); a value means connected.
        networks: Object.entries(brand.networksData ?? {})
          .filter(([, handle]) => typeof handle === 'string' && handle !== '')
          .map(([key, handle]) => ({ network: key.replace(/Data$/, ''), handle })),
      }));
      return { brands };
    },
  });
}
