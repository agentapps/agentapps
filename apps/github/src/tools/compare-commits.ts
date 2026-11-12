import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

const BASEHEAD_PATTERN = /^[\w.\-/:]+\.\.\.[\w.\-/:]+$/;

export function registerCompareCommitsTool(app: AgentApp) {
  app.tool('compare-commits', {
    annotations: { readOnlyHint: true },
    description: 'Compare two commits or branches. `basehead` format `BASE...HEAD`.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        basehead: { type: 'string', description: 'Comparison range, format `BASE...HEAD`.' },
        per_page: { type: 'number' },
        page: { type: 'number' },
      },
      required: ['owner', 'repo', 'basehead'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, basehead, per_page, page } = args as {
        owner: string;
        repo: string;
        basehead: string;
        per_page?: number;
        page?: number;
      };
      if (!BASEHEAD_PATTERN.test(basehead)) throw new Error('`basehead` must match `BASE...HEAD`.');
      return await githubRequest(
        ctx,
        `/repos/${owner}/${repo}/compare/${encodeURIComponent(basehead)}`,
        { params: { per_page, page } },
      );
    },
  });
}
