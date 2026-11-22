import type { AgentApp } from '@agentapps/sdk';
import { buildThreadShape, canvaRequest } from '../lib/index.js';
import { THREAD_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetThreadTool(app: AgentApp): void {
  app.tool('get-thread', {
    description:
      'Get a comment thread by ID. Returns curated thread. Params: designId, threadId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        designId: { type: 'string', description: 'Canva design ID the thread belongs to.' },
        threadId: { type: 'string', description: 'Comment thread ID.' },
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
      required: ['designId', 'threadId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { designId, threadId, fields, includeRaw } = args as {
        designId: string;
        threadId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(designId, 'designId');
      validateNonEmpty(threadId, 'threadId');

      const raw = await canvaRequest(
        ctx,
        `/designs/${encodeURIComponent(designId)}/comments/${encodeURIComponent(threadId)}`,
      );
      const shape = buildThreadShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: THREAD_FIELDS,
      });
    },
  });
}
