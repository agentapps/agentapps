import type { AgentApp } from '@agentapps/sdk';
import { asArgs, readInt, readString } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { compact, type GraphPage, listResult, toNumber } from '../lib/results.js';
import { READ_ONLY } from './annotations.js';

/** Meta's numeric account_status values. */
const ACCOUNT_STATUS: Record<number, string> = {
  1: 'ACTIVE',
  2: 'DISABLED',
  3: 'UNSETTLED',
  7: 'PENDING_RISK_REVIEW',
  8: 'PENDING_SETTLEMENT',
  9: 'IN_GRACE_PERIOD',
  100: 'PENDING_CLOSURE',
  101: 'CLOSED',
  201: 'ANY_ACTIVE',
  202: 'ANY_CLOSED',
};

interface RawAccount {
  id: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  amount_spent?: string;
  spend_cap?: string;
  business?: { id: string; name?: string };
}

export function registerListAdAccountsTool(app: AgentApp): void {
  app.tool('list-ad-accounts', {
    description:
      "List the ad accounts the access token can use. Returns items with id (act_<digits>, the accountId every other tool takes), name, status, currency, timezone, amountSpent and spendCap (both in the currency's minor units, e.g. cents) and the owning business. Max 100 per page; page with `after`.",
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Accounts per page (default 50, max 100).',
        },
        after: { type: 'string', description: 'The nextCursor from a previous call.' },
      },
    },
    annotations: READ_ONLY,
    handler: async (args, ctx) => {
      const a = asArgs(args);
      const limit = readInt(a, 'limit', { min: 1, max: 100, fallback: 50 });
      const after = readString(a, 'after', { max: 500 });
      const page = await apiRequest<GraphPage<RawAccount>>('GET', '/me/adaccounts', ctx, {
        params: {
          fields: [
            'id',
            'account_id',
            'name',
            'account_status',
            'currency',
            'timezone_name',
            'amount_spent',
            'spend_cap',
            'business{id,name}',
          ],
          limit,
          after,
        },
      });
      const items = (page.data ?? []).map((acc) =>
        compact({
          id: acc.id,
          name: acc.name,
          status:
            acc.account_status === undefined
              ? undefined
              : (ACCOUNT_STATUS[acc.account_status] ?? String(acc.account_status)),
          currency: acc.currency,
          timezone: acc.timezone_name,
          amountSpent: toNumber(acc.amount_spent),
          // Meta reports "0" when the account has no spend cap.
          spendCap: toNumber(acc.spend_cap) || undefined,
          business: acc.business
            ? compact({ id: acc.business.id, name: acc.business.name })
            : undefined,
        }),
      );
      return listResult(page, items);
    },
  });
}
