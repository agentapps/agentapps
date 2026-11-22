import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractFile, extractMessage, tsToIso, validateChannelId } from './_helpers.js';
import { wrapSlackCall } from './utils.js';

interface ListPinsArgs {
  channel: string;
  limit?: number;
  cursor?: string;
  includeRaw?: boolean;
}

interface CuratedPin {
  type: 'message' | 'file';
  createdAt: string | null;
  createdBy: string | null;
  message?: ReturnType<typeof extractMessage> | null;
  file?: ReturnType<typeof extractFile> | null;
}

export function registerListPinsTool(app: AgentApp): void {
  app.tool('list-pins', {
    description:
      'List items pinned to a channel (messages and files). Returns { pins: [{ type, createdAt, createdBy, message? | file? }], count }. Retryable. Params: channel.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id whose pins to list.' },
      },
      required: ['channel'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { channel, includeRaw } = args as unknown as ListPinsArgs;
      validateChannelId(channel, 'channel');
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() => client.pins.list({ channel }));
      if (includeRaw) return result;
      const items = (result.items ?? []) as any[];
      const pins: CuratedPin[] = items.map((it) => {
        const base = {
          type: it.type as 'message' | 'file',
          createdAt: tsToIso(it.created),
          createdBy: it.created_by ?? null,
        };
        if (it.type === 'message' && it.message) {
          return { ...base, message: extractMessage(it.message, { channel }) };
        }
        if (it.type === 'file' && it.file) {
          return { ...base, file: extractFile(it.file) };
        }
        return base;
      });
      return {
        pins,
        count: pins.length,
      };
    },
  });
}
