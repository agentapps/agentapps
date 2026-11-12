import type { AgentApp } from '@agentapps/sdk';
import {
  CUSTOMER_ID_SCHEMA,
  DATE_RANGE_SCHEMA,
  LOGIN_CUSTOMER_ID_SCHEMA,
  parseCustomerId,
  parseDateRange,
  parseOptionalCustomerId,
} from '../lib/args.js';
import { METRIC_FIELDS, metricsOf, search } from '../lib/gaql.js';

const ACCOUNT_FIELDS =
  'customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account, customer.auto_tagging_enabled';

export function registerGetAccountSummaryTool(app: AgentApp): void {
  app.tool('get-account-summary', {
    description:
      'Account details and total performance of one Google Ads account for a date range. ' +
      'Returns { customerId, name, currency, timeZone, testAccount, autoTaggingEnabled, dateRange, metrics: { impressions, clicks, ctr, averageCpc, cost, conversions, conversionsValue, costPerConversion } }. ' +
      'Money is in the account currency (not micros); ctr is a fraction (0.05 = 5%). ' +
      'Manager (MCC) accounts have no metrics of their own: use list-client-accounts and summarize a client instead.',
    parameters: {
      type: 'object',
      properties: {
        customerId: CUSTOMER_ID_SCHEMA,
        loginCustomerId: LOGIN_CUSTOMER_ID_SCHEMA,
        ...DATE_RANGE_SCHEMA,
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
      const range = parseDateRange(a);

      const page = await search(
        ctx,
        customerId,
        `SELECT ${ACCOUNT_FIELDS}, ${METRIC_FIELDS.join(', ')} FROM customer WHERE ${range.condition}`,
        { loginCustomerId },
      );
      let row = page.results?.[0];
      if (!row) {
        // No activity in the range: Google returns no row, so read the account details alone.
        const details = await search(ctx, customerId, `SELECT ${ACCOUNT_FIELDS} FROM customer`, {
          loginCustomerId,
        });
        row = details.results?.[0] ?? {};
      }
      const c = row.customer ?? {};
      return {
        customerId,
        name: c.descriptiveName ?? null,
        currency: c.currencyCode ?? null,
        timeZone: c.timeZone ?? null,
        manager: c.manager === true,
        testAccount: c.testAccount === true,
        autoTaggingEnabled: c.autoTaggingEnabled === true,
        dateRange: range.label,
        metrics: metricsOf(row),
      };
    },
  });
}
