import type { AgentApp } from '@agentapps/sdk';
import {
  CUSTOMER_ID_SCHEMA,
  LOGIN_CUSTOMER_ID_SCHEMA,
  parseBoolean,
  parseCustomerId,
  parseEnum,
  parseOptionalCustomerId,
  parseOptionalId,
  VALIDATE_ONLY_SCHEMA,
} from '../lib/args.js';
import { type MutateResponse, mutate } from '../lib/mutate.js';

const MATCH_TYPES = ['EXACT', 'PHRASE', 'BROAD'] as const;
const MAX_KEYWORDS = 100;
/** Google's limits for keyword text. */
const MAX_TEXT_CHARS = 80;
const MAX_WORDS = 10;

interface Keyword {
  text: string;
  matchType: (typeof MATCH_TYPES)[number];
}

function parseKeywords(value: unknown, defaultMatchType: Keyword['matchType']): Keyword[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      '[BAD_REQUEST] keywords must be a non-empty array of strings or { text, matchType } objects.',
    );
  }
  if (value.length > MAX_KEYWORDS) {
    throw new Error(
      `[BAD_REQUEST] At most ${MAX_KEYWORDS} keywords per call; got ${value.length}.`,
    );
  }
  return value.map((item, i) => {
    const obj = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const raw = typeof item === 'string' || typeof item === 'number' ? item : obj.text;
    const text = String(raw ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!text) throw new Error(`[BAD_REQUEST] keywords[${i}] has no text.`);
    if (text.length > MAX_TEXT_CHARS || text.split(' ').length > MAX_WORDS) {
      throw new Error(
        `[BAD_REQUEST] keywords[${i}] "${text.slice(0, 100)}" is too long (max ${MAX_TEXT_CHARS} characters and ${MAX_WORDS} words).`,
      );
    }
    const matchType = parseEnum(
      obj.matchType,
      `keywords[${i}].matchType`,
      MATCH_TYPES,
      defaultMatchType,
    );
    return { text, matchType };
  });
}

/** Maps partial-failure errors back to the operation index they belong to. */
function failuresByIndex(response: MutateResponse): Map<number, string> {
  const failures = new Map<number, string>();
  for (const detail of response.partialFailureError?.details ?? []) {
    for (const err of detail.errors ?? []) {
      const index = err.location?.fieldPathElements?.find(
        (e) => e.fieldName === 'operations',
      )?.index;
      if (index === undefined) continue;
      const [type, code] = Object.entries(err.errorCode ?? {})[0] ?? [];
      failures.set(index, `${type && code ? `${type}.${code}: ` : ''}${err.message ?? 'failed'}`);
    }
  }
  return failures;
}

export function registerAddNegativeKeywordsTool(app: AgentApp): void {
  app.tool('add-negative-keywords', {
    description:
      'Add negative keywords to one campaign or one ad group so ads stop showing for those searches (it blocks traffic, never adds spend). ' +
      'Give exactly one of campaignId or adGroupId. keywords: up to 100 strings or { text, matchType } objects; matchType EXACT, PHRASE or BROAD (default matchType, EXACT if unset). ' +
      'Each keyword is added on its own: one that fails (for example a duplicate) does not stop the others. ' +
      'Returns { success, level, added: [{ text, matchType, resourceName }], failed: [{ text, matchType, error }], validateOnly }. ' +
      'Typical input: wasteful terms from get-search-terms-report. Removing negatives is done in the Google Ads UI.',
    parameters: {
      type: 'object',
      properties: {
        customerId: CUSTOMER_ID_SCHEMA,
        loginCustomerId: LOGIN_CUSTOMER_ID_SCHEMA,
        campaignId: {
          type: ['string', 'number'],
          description:
            'Add campaign-level negatives to this campaign (applies to all its ad groups).',
        },
        adGroupId: {
          type: ['string', 'number'],
          description: 'Add ad group-level negatives to this ad group instead.',
        },
        keywords: {
          type: 'array',
          maxItems: MAX_KEYWORDS,
          description:
            'The negative keywords, e.g. ["free", {"text":"jobs","matchType":"PHRASE"}].',
          items: {
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    description: 'Keyword text, max 80 characters and 10 words.',
                  },
                  matchType: { type: 'string', enum: MATCH_TYPES },
                },
                required: ['text'],
              },
            ],
          },
        },
        matchType: {
          type: 'string',
          enum: MATCH_TYPES,
          description: 'Match type for keywords given as plain strings (default EXACT).',
        },
        validateOnly: VALIDATE_ONLY_SCHEMA,
      },
      required: ['customerId', 'keywords'],
    },
    annotations: {
      readOnlyHint: false,
      // Negatives only block traffic and can be removed again; nothing is lost.
      destructiveHint: false,
      // A second identical call fails per keyword as a duplicate instead of adding more.
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const customerId = parseCustomerId(a.customerId);
      const loginCustomerId = parseOptionalCustomerId(a.loginCustomerId, 'loginCustomerId');
      const campaignId = parseOptionalId(a.campaignId, 'campaignId');
      const adGroupId = parseOptionalId(a.adGroupId, 'adGroupId');
      if (Boolean(campaignId) === Boolean(adGroupId)) {
        throw new Error('[BAD_REQUEST] Give exactly one of campaignId or adGroupId.');
      }
      const defaultMatchType = parseEnum(a.matchType, 'matchType', MATCH_TYPES, 'EXACT');
      const keywords = parseKeywords(a.keywords, defaultMatchType);
      const validateOnly = parseBoolean(a.validateOnly, 'validateOnly', false);

      const level = campaignId ? 'CAMPAIGN' : 'AD_GROUP';
      const parent = campaignId
        ? { campaign: `customers/${customerId}/campaigns/${campaignId}` }
        : { adGroup: `customers/${customerId}/adGroups/${adGroupId}` };
      const response = await mutate(
        ctx,
        customerId,
        campaignId ? 'campaignCriteria' : 'adGroupCriteria',
        {
          operations: keywords.map((k) => ({
            create: {
              ...parent,
              negative: true,
              keyword: { text: k.text, matchType: k.matchType },
            },
          })),
          partialFailure: true,
          validateOnly,
        },
        loginCustomerId,
      );

      const failures = failuresByIndex(response);
      const added: Array<Keyword & { resourceName: string | null }> = [];
      const failed: Array<Keyword & { error: string }> = [];
      keywords.forEach((k, i) => {
        const error = failures.get(i);
        if (error) failed.push({ ...k, error });
        else added.push({ ...k, resourceName: response.results?.[i]?.resourceName || null });
      });
      return {
        success: failed.length === 0,
        level,
        ...(campaignId ? { campaignId } : { adGroupId }),
        added,
        failed,
        validateOnly,
      };
    },
  });
}
