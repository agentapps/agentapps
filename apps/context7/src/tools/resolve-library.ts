/**
 * resolve-library — resolve a Context7 library identifier from a free-text name.
 */

import type { AgentApp } from '@agentapps/sdk';
import { TtlCache } from '../lib/cache.js';
import { fetchContext7Json } from '../lib/client.js';
import { type LibraryCandidate, parseLibraryCandidates } from '../lib/parser.js';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new TtlCache<LibraryCandidate[]>(CACHE_TTL_MS);

function cacheKey(libraryName: string, query: string): string {
  return `${libraryName.toLowerCase().trim()}|${query.toLowerCase().trim()}`;
}

export interface ResolveLibraryOutput {
  libraryName: string;
  query: string;
  candidates: LibraryCandidate[];
  cached: boolean;
  resolvedFrom: 'user' | 'anonymous';
}

export function registerResolveLibraryTool(app: AgentApp): void {
  app.tool('resolve-library', {
    description:
      'Resolve a Context7 library identifier from a free-text name (e.g. "react" → "/reactjs/react.dev"). Returns ranked candidates with reputation and snippet count. Cache: 7d. Use the chosen `id` as `libraryId` for `get-docs`.',
    parameters: {
      type: 'object',
      properties: {
        libraryName: {
          type: 'string',
          description: 'Library name to resolve (e.g. "react", "tamagui")',
        },
        query: {
          type: 'string',
          description: 'Optional refinement query (e.g. "hooks", "router")',
        },
      },
      required: ['libraryName'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const libraryName = String(args.libraryName ?? '').trim();
      const query = String(args.query ?? '').trim();
      if (!libraryName) throw new Error('libraryName is required');

      let installationSecrets: Record<string, string> | null = null;
      try {
        installationSecrets = (await ctx.secrets.getInstallation()) ?? null;
      } catch {
        installationSecrets = null;
      }
      const apiKey = installationSecrets?.CONTEXT7_API_KEY ?? installationSecrets?.context7_api_key;
      const resolvedFrom: 'user' | 'anonymous' = apiKey ? 'user' : 'anonymous';

      const key = cacheKey(libraryName, query);
      const cached = cache.get(key);
      if (cached) {
        const out: ResolveLibraryOutput = {
          libraryName,
          query,
          candidates: cached,
          cached: true,
          resolvedFrom,
        };
        return out;
      }

      const raw = await fetchContext7Json<unknown>('/v2/libs/search', {
        apiKey,
        searchParams: query ? { libraryName, query } : { libraryName },
      });
      const candidates = parseLibraryCandidates(raw).sort(
        (a, b) => b.benchmarkScore - a.benchmarkScore,
      );
      cache.set(key, candidates);

      const out: ResolveLibraryOutput = {
        libraryName,
        query,
        candidates,
        cached: false,
        resolvedFrom,
      };
      return out;
    },
  });
}

export const __testing = { cache, cacheKey };
