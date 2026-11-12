/**
 * get-deploy-status — current state of a specific deploy.
 *
 * Returns DATA (state, url, errorMessage) — the renderer composes the sentence.
 */

import type { AgentApp } from '@agentapps/sdk';
import { netlifyClient } from '../lib/netlify-client.js';

export function registerGetDeployStatusTool(app: AgentApp): void {
  app.tool('get-deploy-status', {
    description:
      'Get the current state of a Netlify deploy. Returns { state, url, errorMessage? }.',
    parameters: {
      type: 'object',
      properties: {
        siteId: {
          type: 'string',
          description: 'The Netlify site id the deploy belongs to.',
        },
        deployId: {
          type: 'string',
          description: 'The deploy id to check.',
        },
      },
      required: ['siteId', 'deployId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const siteId = a.siteId as string;
      const deployId = a.deployId as string;

      const client = await netlifyClient(ctx);
      const deploy = await client.getSiteDeploy(siteId, deployId);

      return {
        state: deploy.state,
        url: deploy.ssl_url ?? deploy.deploy_ssl_url ?? null,
        errorMessage: deploy.error_message ?? null,
        deployId: deploy.id,
        siteId,
      };
    },
  });
}
