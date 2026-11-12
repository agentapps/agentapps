import type { AgentApp } from '@agentapps/sdk';
import { adsRequest } from '../lib/client.js';
import { search } from '../lib/gaql.js';

/** Accounts beyond this are listed by ID only, so the call stays inside one 30 s round. */
const MAX_DETAILED = 10;

const DETAILS_QUERY =
  'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account, customer.status FROM customer LIMIT 1';

export function registerListAccessibleCustomersTool(app: AgentApp): void {
  app.tool('list-accessible-customers', {
    description:
      'List the Google Ads accounts the connected Google user can access directly. Start here. ' +
      'Returns { customers: [{ customerId, name, currency, timeZone, manager, testAccount, status }], total }. ' +
      `Details are fetched for the first ${MAX_DETAILED} accounts; the rest are listed by customerId only (detailsLimited: true). ` +
      'Accounts with manager: true are MCC accounts: use list-client-accounts to see their clients, and pass the manager customerId as loginCustomerId when working on a client account.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      // This endpoint is keyed on the OAuth user and takes no login-customer-id.
      const list = await adsRequest<{ resourceNames?: string[] }>(
        'GET',
        '/customers:listAccessibleCustomers',
        ctx,
      );
      const ids = (list?.resourceNames ?? [])
        .map((name) => /^customers\/(\d+)$/.exec(name)?.[1])
        .filter((id): id is string => Boolean(id));

      const detailed = await Promise.all(
        ids.slice(0, MAX_DETAILED).map(async (customerId) => {
          try {
            const page = await search(ctx, customerId, DETAILS_QUERY);
            const c = page.results?.[0]?.customer ?? {};
            return {
              customerId,
              name: c.descriptiveName ?? null,
              currency: c.currencyCode ?? null,
              timeZone: c.timeZone ?? null,
              manager: c.manager === true,
              testAccount: c.testAccount === true,
              status: c.status ?? null,
            };
          } catch (err) {
            // A cancelled or suspended account must not hide the others.
            return { customerId, error: (err as Error).message.slice(0, 300) };
          }
        }),
      );
      const rest = ids.slice(MAX_DETAILED).map((customerId) => ({ customerId }));
      return {
        customers: [...detailed, ...rest],
        total: ids.length,
        detailsLimited: ids.length > MAX_DETAILED,
      };
    },
  });
}
