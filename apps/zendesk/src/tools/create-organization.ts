import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * create-organization — POST /organizations.json.
 */
export function registerCreateOrganizationTool(app: AgentApp): void {
  app.tool('create-organization', {
    description:
      'Create a new Zendesk organization. Returns the created organization. Not retryable. Params: name, domainNames?, tags?.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Organization name (must be unique).',
        },
        domainNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email domains to auto-associate users (e.g. ["example.com"]).',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to attach to the organization.',
        },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { name, domainNames, tags } = args as {
        name: string;
        domainNames?: string[];
        tags?: string[];
      };

      const organization: Record<string, unknown> = { name };
      if (domainNames) organization.domain_names = domainNames;
      if (tags) organization.tags = tags;

      const result = await zendeskRequest<any>(ctx, '/organizations.json', {
        method: 'POST',
        body: { organization },
      });

      const o = result.organization;
      return {
        id: o.id,
        name: o.name,
        domainNames: o.domain_names ?? [],
        tags: o.tags ?? [],
        createdAt: o.created_at,
        url: o.url,
      };
    },
  });
}
