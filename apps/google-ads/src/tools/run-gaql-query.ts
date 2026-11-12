import type { AgentApp } from '@agentapps/sdk';
import {
  CUSTOMER_ID_SCHEMA,
  LOGIN_CUSTOMER_ID_SCHEMA,
  parseCustomerId,
  parseOptionalCustomerId,
} from '../lib/args.js';
import { search, withinBudget } from '../lib/gaql.js';

const MAX_QUERY_CHARS = 10_000;

export function registerRunGaqlQueryTool(app: AgentApp): void {
  app.tool('run-gaql-query', {
    description:
      'Run a read-only Google Ads Query Language (GAQL) SELECT query against one account (googleAds:search). ' +
      'Use it for anything the report tools do not cover, e.g. ' +
      '"SELECT campaign.name, segments.device, metrics.clicks FROM campaign WHERE segments.date DURING LAST_7_DAYS ORDER BY metrics.clicks DESC LIMIT 50". ' +
      'Returns { results: [...rows as Google returns them], rowCount, fieldMask, nextPageToken, limitApplied }. ' +
      'Rows use camelCase keys (metrics.costMicros); int64 values (ids, impressions, clicks, *Micros) are strings; money is in micros (divide by 1,000,000); fields at 0 or false are omitted. ' +
      'Always add a LIMIT: a page holds up to 10,000 rows and the result is cut at about 45,000 characters (limitApplied: true, no nextPageToken then; narrow the query). ' +
      'Field reference: https://developers.google.com/google-ads/api/fields/v26/overview',
    parameters: {
      type: 'object',
      properties: {
        customerId: CUSTOMER_ID_SCHEMA,
        loginCustomerId: LOGIN_CUSTOMER_ID_SCHEMA,
        query: {
          type: 'string',
          description: 'The GAQL query. Must start with SELECT. Include a LIMIT.',
        },
        pageToken: {
          type: 'string',
          description:
            'nextPageToken from a previous call with the same query, to get the next page.',
        },
      },
      required: ['customerId', 'query'],
    },
    annotations: {
      // googleAds:search only reads; GAQL has no way to change anything.
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const customerId = parseCustomerId(a.customerId);
      const loginCustomerId = parseOptionalCustomerId(a.loginCustomerId, 'loginCustomerId');
      const query = typeof a.query === 'string' ? a.query.trim() : '';
      if (!/^select\s/i.test(query)) {
        throw new Error('[BAD_REQUEST] query must be a GAQL statement starting with SELECT.');
      }
      if (query.length > MAX_QUERY_CHARS) {
        throw new Error(`[BAD_REQUEST] query is longer than ${MAX_QUERY_CHARS} characters.`);
      }
      const pageToken =
        a.pageToken === undefined || a.pageToken === '' ? undefined : String(a.pageToken);

      const page = await search(ctx, customerId, query, { loginCustomerId, pageToken });
      const rows = page.results ?? [];
      const { kept, cut } = withinBudget(rows, 44_000);
      return {
        results: kept,
        rowCount: kept.length,
        fieldMask: page.fieldMask ?? null,
        // A token after a cut would skip the rows dropped here, so it is only passed on whole pages.
        nextPageToken: cut ? null : (page.nextPageToken ?? null),
        limitApplied: cut,
        ...(cut
          ? {
              note: `Only ${kept.length} of ${rows.length} rows fit in the result. Add or lower the LIMIT, select fewer fields or filter more.`,
            }
          : {}),
      };
    },
  });
}
