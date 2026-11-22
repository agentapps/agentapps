import type { AgentApp } from '@agentapps/sdk';
import { buildThreadShape, canvaRequest } from '../lib/index.js';
import { THREAD_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerCreateThreadTool(app: AgentApp): void {
  app.tool('create-thread', {
    description:
      'Create a comment thread on a design. message ≤ 2048 chars. Returns curated thread. Not retryable. Params: designId, message, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        designId: { type: 'string', description: 'Canva design ID.' },
        message: { type: 'string', description: 'Comment body (plain text, max 2048 characters).' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Canva thread response. Default false.',
        },
      },
      required: ['designId', 'message'],
    },
    // Posts a comment other collaborators see: an outside write, a creation rather than a destruction.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { designId, message, fields, includeRaw } = args as {
        designId: string;
        message: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(designId, 'designId');
      validateNonEmpty(message, 'message');
      if (message.length > 2048) {
        throw new Error(`message must be ≤ 2048 characters (received ${message.length}).`);
      }

      const raw = await canvaRequest(ctx, `/designs/${encodeURIComponent(designId)}/comments`, {
        method: 'POST',
        body: { message_plaintext: message },
      });
      const shape = buildThreadShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: THREAD_FIELDS,
      });
    },
  });
}
