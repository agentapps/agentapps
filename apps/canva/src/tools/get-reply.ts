import type { AgentApp } from '@agentapps/sdk';
import { buildReplyShape, canvaRequest } from '../lib/index.js';
import { REPLY_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetReplyTool(app: AgentApp): void {
  app.tool('get-reply', {
    description:
      'Get a single reply within a comment thread. Returns curated reply. Params: designId, threadId, replyId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        designId: { type: 'string', description: 'Canva design ID.' },
        threadId: { type: 'string', description: 'Comment thread ID.' },
        replyId: { type: 'string', description: 'Reply ID.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Canva reply response. Default false.',
        },
      },
      required: ['designId', 'threadId', 'replyId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { designId, threadId, replyId, fields, includeRaw } = args as {
        designId: string;
        threadId: string;
        replyId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(designId, 'designId');
      validateNonEmpty(threadId, 'threadId');
      validateNonEmpty(replyId, 'replyId');

      const raw = await canvaRequest(
        ctx,
        `/designs/${encodeURIComponent(designId)}/comments/${encodeURIComponent(threadId)}/replies/${encodeURIComponent(replyId)}`,
      );
      const shape = buildReplyShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: REPLY_FIELDS,
      });
    },
  });
}
