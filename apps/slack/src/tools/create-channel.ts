import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { CHANNEL_DETAIL_FIELDS } from './_fields.js';
import { cleanOptionalString, extractChannel } from './_helpers.js';
import { resolveFields, sanitiseBody, wrapSlackMutation } from './utils.js';

interface CreateChannelArgs {
  name: string;
  isPrivate?: boolean;
  topic?: string;
  fields?: string[];
  includeRaw?: boolean;
}

const NAME_RE = /^[a-z0-9_-]{1,80}$/;

export function registerCreateChannelTool(app: AgentApp): void {
  app.tool('create-channel', {
    description:
      "Create a channel. Slack normalizes the name (lowercase, no spaces, only [a-z0-9_-], ≤80). Returns the curated channel + ActionBadge('created'). Not retryable. Params: name, isPrivate? (def false), topic?, fields?, includeRaw.",
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Channel name (lowercase, ≤80 chars, only letters/digits/underscore/hyphen).',
        },
        isPrivate: {
          type: 'boolean',
          description: 'Create as private. Default false.',
        },
        topic: {
          type: 'string',
          description: 'Optional channel topic, set after creation.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist on the returned channel.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Slack channel object. Default false.',
        },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { name, isPrivate, topic, fields, includeRaw } = args as unknown as CreateChannelArgs;
      if (!NAME_RE.test(name)) {
        throw new Error(
          `Invalid name "${name}": must be lowercase, ≤80 chars, only letters/digits/underscore/hyphen.`,
        );
      }
      const cleanTopic = cleanOptionalString(topic);
      const { botClient: client } = await getSlackSession(ctx);

      const created = await wrapSlackMutation(() =>
        client.conversations.create(sanitiseBody({ name, is_private: isPrivate ?? false }) as any),
      );
      const raw = created.channel;
      if (!raw) throw new Error('Slack conversations.create returned no channel');

      if (cleanTopic) {
        try {
          await client.conversations.setTopic({ channel: raw.id!, topic: cleanTopic });
          (raw as any).topic = { value: cleanTopic };
        } catch {
          // Non-fatal: channel created but topic not set. Renderer can still display.
        }
      }

      const shape = extractChannel(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: CHANNEL_DETAIL_FIELDS,
      });
    },
  });
}
