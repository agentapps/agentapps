import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { isUserId, tsToIso } from './_helpers.js';
import { sanitiseBody, wrapSlackCall } from './utils.js';

interface GetUserProfileArgs {
  userId?: string;
  includeLabels?: boolean;
  includeRaw?: boolean;
}

interface CuratedProfile {
  userId: string | null;
  realName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  statusExpiration: string | null;
  imageUrl: string | null;
  tz: string | null;
  customFields: Record<string, { value: string; alt?: string }> | null;
}

function extractProfile(raw: any, userId: string | null): CuratedProfile {
  const status_exp =
    typeof raw?.status_expiration === 'number' && raw.status_expiration > 0
      ? tsToIso(raw.status_expiration)
      : null;
  const customFields =
    raw?.fields && typeof raw.fields === 'object' && Object.keys(raw.fields).length > 0
      ? (raw.fields as Record<string, { value: string; alt?: string }>)
      : null;
  return {
    userId,
    realName: raw?.real_name ?? '',
    displayName: raw?.display_name ?? '',
    email: raw?.email ?? null,
    phone: raw?.phone || null,
    title: raw?.title || null,
    statusText: raw?.status_text || null,
    statusEmoji: raw?.status_emoji || null,
    statusExpiration: status_exp,
    imageUrl: raw?.image_512 ?? raw?.image_192 ?? raw?.image_72 ?? null,
    tz: raw?.tz ?? null,
    customFields,
  };
}

export function registerGetUserProfileTool(app: AgentApp): void {
  app.tool('get-user-profile', {
    description:
      'Get the full Slack profile for a user (status, custom_fields, image, phone, title, timezone). Returns curated profile. Retryable. Params: userId? (default: authed user), includeLabels (def false), includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: "User id (U... / W...). Omit to get the authenticated user's own profile.",
        },
        includeLabels: {
          type: 'boolean',
          description: 'Include custom field labels in the response. Default false.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Slack profile object. Default false.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { userId, includeLabels, includeRaw } = args as unknown as GetUserProfileArgs;
      if (userId !== undefined && !isUserId(userId)) {
        throw new Error(`Invalid userId: expected Slack user id (U.../W...), got "${userId}"`);
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        client.users.profile.get(
          sanitiseBody({ user: userId, include_labels: includeLabels ?? false }) as any,
        ),
      );
      if (includeRaw) return result;
      return extractProfile(result.profile ?? {}, userId ?? null);
    },
  });
}
