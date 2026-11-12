/**
 * Partial updates shared by the write tools. LinkedIn applies them with a POST to the
 * entity and `X-RestLi-Method: PARTIAL_UPDATE`, answering 204 No Content.
 */

import type { Money } from './args.js';
import { apiRequest, type ClientContext } from './client.js';

const PARTIAL_UPDATE = { 'X-RestLi-Method': 'PARTIAL_UPDATE' };

/** Sets fields on one entity (`$set`). */
export async function patchEntity(
  ctx: ClientContext,
  path: string,
  set: Record<string, unknown>,
): Promise<void> {
  await apiRequest('POST', path, ctx, {
    headers: PARTIAL_UPDATE,
    body: { patch: { $set: set } },
    scope: 'rw_ads',
  });
}

/** The account's currency, which every budget on it must use. */
export async function accountCurrency(ctx: ClientContext, accountId: string): Promise<string> {
  const account = await apiRequest<{ currency?: unknown }>('GET', `/adAccounts/${accountId}`, ctx, {
    scope: 'r_ads',
  });
  if (typeof account.currency !== 'string' || !account.currency) {
    throw new Error(`[LINKEDIN_ADS_ERROR] Ad account ${accountId} has no currency in its record.`);
  }
  return account.currency;
}

/** The currency of an existing budget, or of the account when the entity has none. */
export async function budgetCurrency(
  ctx: ClientContext,
  accountId: string,
  ...budgets: Array<Money | null>
): Promise<string> {
  const existing = budgets.find((b) => b !== null);
  return existing ? existing.currencyCode : accountCurrency(ctx, accountId);
}
