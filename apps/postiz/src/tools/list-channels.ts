import type { AgentApp } from '@agentapps/sdk';
import { apiRequest } from '../lib/client.js';

interface Integration {
  id: string;
  name?: string;
  identifier?: string;
  profile?: string;
  disabled?: boolean;
}

export function registerListChannelsTool(app: AgentApp): void {
  /** @spec POSTIZ-REQ-3 */
  app.tool('list-channels', {
    description:
      'List the social channels connected in Postiz. Returns { channels: [{ id, name, provider, profile, disabled }] }. "provider" is the network (x, linkedin, linkedin-page, instagram, ...); use it as "__type" in the settings of a post. Use the id with create-draft, schedule-post, publish-post, find-next-slot and get-channel-analytics.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const integrations = await apiRequest<Integration[]>('GET', '/integrations', ctx);
      return {
        channels: (Array.isArray(integrations) ? integrations : []).map((channel) => ({
          id: channel.id,
          name: channel.name ?? '',
          provider: channel.identifier ?? '',
          profile: channel.profile ?? '',
          disabled: channel.disabled === true,
        })),
      };
    },
  });
}
