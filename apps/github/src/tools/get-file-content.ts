import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerGetFileContentTool(app: AgentApp) {
  app.tool('get-file-content', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'Get the content of a file in a repository',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path in repository' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA' },
      },
      required: ['owner', 'repo', 'path'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, path, ref } = args as {
        owner: string;
        repo: string;
        path: string;
        ref?: string;
      };
      const safePath = path
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');
      const data = (await githubRequest(ctx, `/repos/${owner}/${repo}/contents/${safePath}`, {
        params: { ref },
      })) as any;
      if (data.content && data.encoding === 'base64') {
        data.decoded_content = Buffer.from(data.content, 'base64').toString('utf-8');
      }
      return data;
    },
  });
}
