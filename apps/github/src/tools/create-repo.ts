import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerCreateRepoTool(app: AgentApp) {
  app.tool('create-repo', {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    description: 'Create a new repository',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Repository name' },
        description: { type: 'string', description: 'Repository description' },
        private: { type: 'boolean', description: 'Create as private repository (default: false)' },
        auto_init: { type: 'boolean', description: 'Initialize with README (default: false)' },
        gitignore_template: {
          type: 'string',
          description: 'Gitignore template name (e.g., "Node", "Python")',
        },
        license_template: {
          type: 'string',
          description: 'License template (e.g., "mit", "apache-2.0")',
        },
        org: {
          type: 'string',
          description: 'Organization name. If provided, creates repo under the org.',
        },
      },
      required: ['name'],
    },
    handler: async (args, ctx) => {
      const {
        name,
        description,
        private: isPrivate,
        auto_init,
        gitignore_template,
        license_template,
        org,
      } = args as {
        name: string;
        description?: string;
        private?: boolean;
        auto_init?: boolean;
        gitignore_template?: string;
        license_template?: string;
        org?: string;
      };
      const body = {
        name,
        description,
        private: isPrivate ?? false,
        auto_init,
        gitignore_template,
        license_template,
      };
      const endpoint = org ? `/orgs/${org}/repos` : '/user/repos';
      return await githubRequest(ctx, endpoint, { method: 'POST', body });
    },
  });
}
