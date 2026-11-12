import type { AgentApp } from '@agentapps/sdk';
import {
  CUSTOMER_ID_SCHEMA,
  LOGIN_CUSTOMER_ID_SCHEMA,
  parseBoolean,
  parseCustomerId,
  parseInteger,
  parseOptionalCustomerId,
} from '../lib/args.js';
import { search, withinBudget } from '../lib/gaql.js';

export function registerListClientAccountsTool(app: AgentApp): void {
  app.tool('list-client-accounts', {
    description:
      'List the client accounts under a manager (MCC) account, from the customer_client resource. ' +
      'Returns { managerId, loginCustomerId, clients: [{ customerId, name, manager, level, status, currency, timeZone, testAccount }], limitApplied }. ' +
      'To work on a client, call the other tools with customerId = the client and loginCustomerId = the returned loginCustomerId. ' +
      'Only enabled accounts by default; at most 1000 per call.',
    parameters: {
      type: 'object',
      properties: {
        customerId: { ...CUSTOMER_ID_SCHEMA, description: 'The manager (MCC) account ID.' },
        loginCustomerId: LOGIN_CUSTOMER_ID_SCHEMA,
        maxLevel: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description:
            'How deep to go: 1 (default) = direct clients only, 2 = also the clients of sub-managers, and so on.',
        },
        includeInactive: {
          type: 'boolean',
          description: 'Default false. Also list cancelled, suspended and closed accounts.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum accounts to return (default 200, max 1000).',
        },
      },
      required: ['customerId'],
    },
    annotations: {
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
      const maxLevel = parseInteger(a.maxLevel, 'maxLevel', { min: 1, max: 10, fallback: 1 });
      const includeInactive = parseBoolean(a.includeInactive, 'includeInactive', false);
      const limit = parseInteger(a.limit, 'limit', { min: 1, max: 1000, fallback: 200 });

      const where = [`customer_client.level >= 1`, `customer_client.level <= ${maxLevel}`];
      if (!includeInactive) where.push(`customer_client.status = 'ENABLED'`);
      const query =
        'SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, ' +
        'customer_client.level, customer_client.status, customer_client.currency_code, ' +
        'customer_client.time_zone, customer_client.test_account FROM customer_client ' +
        `WHERE ${where.join(' AND ')} ORDER BY customer_client.level, customer_client.descriptive_name LIMIT ${limit + 1}`;

      const page = await search(ctx, customerId, query, { loginCustomerId });
      const rows = page.results ?? [];
      const clients = rows.slice(0, limit).map((row) => {
        const c = row.customerClient ?? {};
        return {
          customerId: String(c.id ?? ''),
          name: c.descriptiveName ?? null,
          manager: c.manager === true,
          level: Number(c.level ?? 0),
          status: c.status ?? null,
          currency: c.currencyCode ?? null,
          timeZone: c.timeZone ?? null,
          testAccount: c.testAccount === true,
        };
      });
      const { kept, cut } = withinBudget(clients);
      return {
        managerId: customerId,
        // Any manager above a client works as login-customer-id; the one the user reached it by is safest.
        loginCustomerId: loginCustomerId ?? customerId,
        clients: kept,
        limitApplied: rows.length > limit || cut,
      };
    },
  });
}
