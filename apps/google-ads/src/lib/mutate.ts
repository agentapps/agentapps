/**
 * Mutate helpers for the write tools. Mutates are POSTs that are never retried once
 * Google answered (see client.ts), and every write tool returns a short summary.
 */

import {
  type Args,
  CUSTOMER_ID_SCHEMA,
  LOGIN_CUSTOMER_ID_SCHEMA,
  parseBoolean,
  parseCustomerId,
  parseId,
  parseOptionalCustomerId,
  VALIDATE_ONLY_SCHEMA,
} from './args.js';
import { adsRequest, type ClientContext } from './client.js';

export interface MutateResponse {
  results?: Array<{ resourceName?: string }>;
  partialFailureError?: {
    message?: string;
    details?: Array<{
      '@type'?: string;
      errors?: Array<{
        errorCode?: Record<string, string>;
        message?: string;
        location?: { fieldPathElements?: Array<{ fieldName?: string; index?: number }> };
      }>;
    }>;
  };
}

export function mutate(
  ctx: ClientContext,
  customerId: string,
  service: 'campaigns' | 'adGroups' | 'campaignBudgets' | 'campaignCriteria' | 'adGroupCriteria',
  body: Record<string, unknown>,
  loginCustomerId?: string,
): Promise<MutateResponse> {
  return adsRequest<MutateResponse>('POST', `/customers/${customerId}/${service}:mutate`, ctx, {
    body,
    loginCustomerId,
  }).then((r) => r ?? {});
}

type StatusTarget = 'campaign' | 'adGroup';

const TARGETS: Record<StatusTarget, { service: 'campaigns' | 'adGroups'; idName: string }> = {
  campaign: { service: 'campaigns', idName: 'campaignId' },
  adGroup: { service: 'adGroups', idName: 'adGroupId' },
};

/** Parameters shared by the pause and enable tools. */
export function statusParameters(target: StatusTarget) {
  const { idName } = TARGETS[target];
  return {
    type: 'object' as const,
    properties: {
      customerId: CUSTOMER_ID_SCHEMA,
      loginCustomerId: LOGIN_CUSTOMER_ID_SCHEMA,
      [idName]: {
        type: ['string', 'number'],
        description:
          target === 'campaign'
            ? 'Numeric campaign ID (list-campaigns).'
            : 'Numeric ad group ID (get-performance-report with level AD_GROUP).',
      },
      validateOnly: VALIDATE_ONLY_SCHEMA,
    },
    required: ['customerId', idName],
  };
}

/** Sets the status of one campaign or ad group and returns a short summary. */
export async function setStatus(
  ctx: ClientContext,
  target: StatusTarget,
  status: 'ENABLED' | 'PAUSED',
  args: unknown,
) {
  const a = (args ?? {}) as Args;
  const { service, idName } = TARGETS[target];
  const customerId = parseCustomerId(a.customerId);
  const loginCustomerId = parseOptionalCustomerId(a.loginCustomerId, 'loginCustomerId');
  const id = parseId(a[idName], idName);
  const validateOnly = parseBoolean(a.validateOnly, 'validateOnly', false);
  const resourceName = `customers/${customerId}/${service}/${id}`;

  const response = await mutate(
    ctx,
    customerId,
    service,
    { operations: [{ updateMask: 'status', update: { resourceName, status } }], validateOnly },
    loginCustomerId,
  );
  return {
    success: true,
    [idName]: id,
    resourceName: response.results?.[0]?.resourceName ?? resourceName,
    status,
    validateOnly,
  };
}
