import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerCreateReleaseTool(app: AgentApp) {
  app.tool('create-release', {
    annotations: { readOnlyHint: false },
    description: 'Create a GitHub release tagged at `tag_name`.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        tag_name: { type: 'string', description: 'Tag this release points to' },
        target_commitish: { type: 'string', description: 'Branch or SHA the tag is created from' },
        name: { type: 'string', description: 'Release title' },
        body: { type: 'string', description: 'Release notes (markdown)' },
        draft: { type: 'boolean' },
        prerelease: { type: 'boolean' },
        generate_release_notes: { type: 'boolean' },
      },
      required: ['owner', 'repo', 'tag_name'],
    },
    handler: async (args, ctx) => {
      const {
        owner,
        repo,
        tag_name,
        target_commitish,
        name,
        body,
        draft,
        prerelease,
        generate_release_notes,
      } = args as {
        owner: string;
        repo: string;
        tag_name: string;
        target_commitish?: string;
        name?: string;
        body?: string;
        draft?: boolean;
        prerelease?: boolean;
        generate_release_notes?: boolean;
      };
      if (!tag_name || tag_name.trim() === '')
        throw new Error('`tag_name` must be a non-empty string.');
      return await githubRequest(ctx, `/repos/${owner}/${repo}/releases`, {
        method: 'POST',
        body: {
          tag_name,
          target_commitish,
          name,
          body,
          draft: draft ?? false,
          prerelease: prerelease ?? false,
          generate_release_notes: generate_release_notes ?? false,
        },
      });
    },
  });
}
