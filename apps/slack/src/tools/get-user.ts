import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { USER_DETAIL_FIELDS } from './_fields.js';
import { cleanOptionalString, extractUser, validateUserId } from './_helpers.js';
import { resolveFields, wrapSlackCall } from './utils.js';

interface GetUserArgs {
  userId?: string;
  email?: string;
  fields?: string[];
  includeRaw?: boolean;
}

export function registerGetUserTool(app: AgentApp): void {
  app.tool('get-user', {
    description:
      'Get a single user by id or email. Returns the curated user (id, name, realName, displayName, email, imageUrl, profile, tz). Provide exactly one of userId/email. Params: userId?, email?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'Slack user id (U... / W...). Mutex with email.',
        },
        email: {
          type: 'string',
          description: 'User email. Mutex with userId.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Slack user object. Default false.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { userId, email, fields, includeRaw } = args as GetUserArgs;
      const cleanEmail = cleanOptionalString(email);
      const cleanId = cleanOptionalString(userId);
      if (!!cleanId === !!cleanEmail) {
        throw new Error('Provide exactly one of userId or email.');
      }
      if (cleanId) validateUserId(cleanId, 'userId');

      const { client } = await getSlackSession(ctx);
      const raw = cleanId
        ? (await wrapSlackCall(() => client.users.info({ user: cleanId }))).user
        : (await wrapSlackCall(() => client.users.lookupByEmail({ email: cleanEmail! }))).user;
      if (!raw) throw new Error('Slack user not found');
      const shape = extractUser(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: USER_DETAIL_FIELDS,
      });
    },
  });
}
