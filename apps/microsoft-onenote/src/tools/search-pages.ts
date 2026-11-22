import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, escapeODataLiteral, formatPage, PAGE_EXPAND } from '../lib/index.js';

const DEFAULT_TOP = 25;
const MAX_TOP = 100;

/**
 * Does this error mean "this account cannot run this kind of query"?
 *
 * Only an OData-shaped rejection justifies degrading to the next strategy.
 * Anything else — a dead token, a missing scope, throttling, a network
 * failure, a bug in a shared helper — must surface, or the agent is told
 * "no matching notes" for a problem the user could have acted on (spec §8.1).
 * `buildGraphError` embeds Graph's own error code in the message, so the
 * query-rejection codes are what we match on.
 */
function isUnsupportedQuery(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /BadRequest|InvalidRequest|ParseUri|not supported|unsupported|invalid filter|invalid query|\$search|\$filter/i.test(
    message,
  );
}

/**
 * search-pages — GET /me/onenote/pages with $search, falling back to $filter.
 *
 * $search over OneNote pages is inconsistently supported between personal and
 * work accounts (spec §6), so this tool degrades in two steps rather than
 * failing: a title-match filter, then an explained empty result.
 */
export function registerSearchPagesTool(app: AgentApp): void {
  app.tool('search-pages', {
    description:
      'Search OneNote pages by text. Results may not be exhaustive — OneNote search coverage varies by account type, and this falls back to matching page titles when full-text search is unavailable. Use list-pages to browse a section reliably.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for. Pass the literal text, not a pre-encoded string.',
        },
        top: {
          type: 'number',
          description: `Maximum pages to return. Defaults to ${DEFAULT_TOP}, capped at ${MAX_TOP}.`,
        },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      if (typeof a.query !== 'string' || a.query.trim() === '') {
        throw new Error('Specify query — the text to search OneNote pages for.');
      }
      const query = a.query.trim();

      const requested = typeof a.top === 'number' && Number.isFinite(a.top) ? a.top : DEFAULT_TOP;
      const top = Math.min(Math.max(Math.trunc(requested), 1), MAX_TOP);
      const common = `$expand=${PAGE_EXPAND}&$top=${top}`;

      /** Why the last strategy was abandoned, so the `note` can name it. */
      let lastFailure = '';

      // Only the request is inside the try: shaping the response is our own
      // code, and a bug there must not masquerade as an unsupported query.
      let searchResponse: { value?: any[] } | undefined;
      try {
        searchResponse = await graphRequest<{ value?: any[] }>(
          'GET',
          `/me/onenote/pages?$search=${encodeURIComponent(query)}&${common}`,
        );
      } catch (error) {
        if (!isUnsupportedQuery(error)) throw error;
        lastFailure = error instanceof Error ? error.message : String(error);
      }
      if (searchResponse) {
        const pages = (searchResponse.value || []).map((p) => formatPage(p));
        return { account: email, query, searchMethod: 'search', count: pages.length, pages };
      }

      // The term goes inside a quoted OData literal, so an apostrophe would
      // terminate it early and change what the filter means.
      const filter = `contains(title,'${escapeODataLiteral(query)}')`;
      let filterResponse: { value?: any[] } | undefined;
      try {
        filterResponse = await graphRequest<{ value?: any[] }>(
          'GET',
          `/me/onenote/pages?$filter=${encodeURIComponent(filter)}&${common}`,
        );
      } catch (error) {
        if (!isUnsupportedQuery(error)) throw error;
        lastFailure = error instanceof Error ? error.message : String(error);
      }
      if (filterResponse) {
        const pages = (filterResponse.value || []).map((p) => formatPage(p));
        return { account: email, query, searchMethod: 'filter', count: pages.length, pages };
      }

      return {
        account: email,
        query,
        searchMethod: 'none',
        count: 0,
        pages: [],
        note:
          'OneNote rejected both full-text search and a title filter on this account. ' +
          `Use list-pages to browse a notebook or section instead. Last error: ${lastFailure}`,
      };
    },
  });
}
