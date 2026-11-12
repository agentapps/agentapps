/**
 * get-docs — fetch up-to-date documentation snippets for a Context7-resolved library.
 */

import type { AgentApp } from '@agentapps/sdk';
import { fetchContext7Raw } from '../lib/client.js';
import { type DocSnippet, parseDocSnippets } from '../lib/parser.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

export interface GetDocsOutput {
  libraryId: string;
  query: string;
  snippets: DocSnippet[];
  totalReturned: number;
  resolvedFrom: 'user' | 'anonymous';
}

export function registerGetDocsTool(app: AgentApp): void {
  app.tool('get-docs', {
    description:
      'Fetch up-to-date documentation snippets for a Context7-resolved libraryId. Returns array of {title, source, description, code, language}. Use `resolve-library` first to get the libraryId.',
    parameters: {
      type: 'object',
      properties: {
        libraryId: {
          type: 'string',
          description:
            'Context7-compatible library id (e.g. "/reactjs/react.dev"). Get it from `resolve-library`.',
        },
        query: {
          type: 'string',
          description: 'Topic or question (e.g. "useEffect cleanup", "router hooks")',
        },
        format: {
          type: 'string',
          enum: ['json', 'txt'],
          description: 'Response format from Context7 (default: json)',
        },
        limit: {
          type: 'number',
          description: `Max snippets to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
        },
      },
      required: ['libraryId', 'query'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const libraryId = String(args.libraryId ?? '').trim();
      const query = String(args.query ?? '').trim();
      if (!libraryId) throw new Error('libraryId is required');
      if (!query) throw new Error('query is required');
      const format = (args.format === 'txt' ? 'txt' : 'json') as 'json' | 'txt';
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(args.limit ?? DEFAULT_LIMIT)));

      let installationSecrets: Record<string, string> | null = null;
      try {
        installationSecrets = (await ctx.secrets.getInstallation()) ?? null;
      } catch {
        installationSecrets = null;
      }
      const apiKey = installationSecrets?.CONTEXT7_API_KEY ?? installationSecrets?.context7_api_key;
      const resolvedFrom: 'user' | 'anonymous' = apiKey ? 'user' : 'anonymous';

      const raw = await fetchContext7Raw('/v2/context', {
        apiKey,
        searchParams: { libraryId, query, type: format },
      });

      const parsed = format === 'json' ? (safeJson(raw.text) ?? raw.text) : raw.text;
      const snippets = parseDocSnippets(parsed).slice(0, limit);

      const out: GetDocsOutput = {
        libraryId,
        query,
        snippets,
        totalReturned: snippets.length,
        resolvedFrom,
      };
      return out;
    },
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
