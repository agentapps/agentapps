import { type Args, readList } from './args.js';

/** Values Meta accepts in the effective_status filter of the list edges. */
export const EFFECTIVE_STATUSES = [
  'ACTIVE',
  'PAUSED',
  'DELETED',
  'PENDING_REVIEW',
  'DISAPPROVED',
  'PREAPPROVED',
  'PENDING_BILLING_INFO',
  'CAMPAIGN_PAUSED',
  'ARCHIVED',
  'ADSET_PAUSED',
  'IN_PROCESS',
  'WITH_ISSUES',
] as const;

export const STATUSES_PARAMETER = {
  type: 'array',
  items: { type: 'string', enum: [...EFFECTIVE_STATUSES] },
  description:
    'Filter by effective status, e.g. ["ACTIVE"] or ["ACTIVE","PAUSED"]. A comma-separated string works too. Default: Meta\'s default (everything except deleted and archived).',
} as const;

/**
 * The effective_status query value. Graph wants a JSON array (`["ACTIVE","PAUSED"]`), not a
 * comma list, so it is serialized here and URL-encoded by the client.
 */
export function readStatuses(a: Args): string | undefined {
  const items = readList(a, 'statuses', {
    pattern: /^[A-Za-z_]+$/,
    max: EFFECTIVE_STATUSES.length,
    describe: `one of ${EFFECTIVE_STATUSES.join(', ')}`,
  });
  if (!items) return undefined;
  const upper = items.map((s) => s.toUpperCase());
  for (const s of upper) {
    if (!(EFFECTIVE_STATUSES as readonly string[]).includes(s)) {
      throw new Error(
        `[BAD_REQUEST] statuses item ${JSON.stringify(s)} is not one of ${EFFECTIVE_STATUSES.join(', ')}.`,
      );
    }
  }
  return JSON.stringify(upper);
}
