import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface CreateServiceResponse {
  service: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  deployId: string | null;
}

/**
 * create-service -- POST /services.
 */
export function registerCreateServiceTool(app: AgentApp): void {
  app.tool('create-service', {
    description:
      'Create a new service on Render from a GitHub repository. Use list-owners to get ownerId. Returns { serviceId, name, type, status, deployId? }. Params: name (required), ownerId (required), type (required), repoURL (required), branch?, buildCommand?, startCommand?, plan?, region?, autoDeploy?.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Service name.',
        },
        ownerId: {
          type: 'string',
          description: 'Owner/workspace ID (use list-owners to get IDs).',
        },
        type: {
          type: 'string',
          description:
            'Service type: web_service, static_site, background_worker, private_service, cron_job.',
        },
        repoURL: {
          type: 'string',
          description: 'GitHub repository URL (e.g., "https://github.com/owner/repo").',
        },
        branch: {
          type: 'string',
          description: 'Branch to deploy from (default: "main").',
        },
        buildCommand: {
          type: 'string',
          description: 'Build command (e.g., "npm run build").',
        },
        startCommand: {
          type: 'string',
          description: 'Start command for web/worker services (e.g., "node server.js").',
        },
        plan: {
          type: 'string',
          description: 'Instance plan (e.g., "free", "starter", "standard", "pro").',
        },
        region: {
          type: 'string',
          description: 'Deployment region (e.g., "oregon", "frankfurt", "singapore").',
        },
        autoDeploy: {
          type: 'string',
          description: 'Auto-deploy on git push: "yes" or "no" (default: "yes").',
        },
      },
      required: ['name', 'ownerId', 'type', 'repoURL'],
    },
    // Can start real spend: `plan` accepts paid instance plans, billed from creation.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as {
        name: string;
        ownerId: string;
        type: string;
        repoURL: string;
        branch?: string;
        buildCommand?: string;
        startCommand?: string;
        plan?: string;
        region?: string;
        autoDeploy?: string;
      };

      const serviceDetails: Record<string, unknown> = {
        repoURL: a.repoURL,
        branch: a.branch ?? 'main',
        autoDeploy: a.autoDeploy ?? 'yes',
      };
      if (a.buildCommand) serviceDetails.buildCommand = a.buildCommand;
      if (a.startCommand) serviceDetails.startCommand = a.startCommand;
      if (a.plan) serviceDetails.plan = a.plan;
      if (a.region) serviceDetails.region = a.region;

      const result = await renderRequest<CreateServiceResponse>(ctx, '/services', {
        method: 'POST',
        body: {
          name: a.name,
          ownerId: a.ownerId,
          type: a.type,
          serviceDetails,
        },
      });

      return {
        serviceId: result.service.id,
        name: result.service.name,
        type: result.service.type,
        status: result.service.status,
        deployId: result.deployId,
      };
    },
  });
}
