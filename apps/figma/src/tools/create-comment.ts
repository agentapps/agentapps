import type { AgentApp } from '@agentapps/sdk';
import { figmaRequest } from '../lib/index.js';
import { COMMENT_FIELDS } from './_fields.js';
import { resolveFields, sanitiseBody, validateFileKey } from './utils.js';

interface RawCommentResponse {
  id: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
  user?: { handle?: string };
  parent_id?: string;
  client_meta?: { x?: number; y?: number; node_id?: string };
}

interface ClientMeta {
  x?: number;
  y?: number;
  node_id?: string;
}

export function registerCreateCommentTool(app: AgentApp): void {
  app.tool('create-comment', {
    description:
      'Create a new comment on a Figma file, or reply to an existing one. Returns the created comment. Params: fileKey, message, parentCommentId?, clientMeta?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'The file key from a Figma URL.' },
        message: { type: 'string', description: 'Comment body. Plain text or @mentions.' },
        parentCommentId: {
          type: 'string',
          description: 'When provided, the new comment is a reply to this comment ID.',
        },
        clientMeta: {
          type: 'object',
          description: 'Optional canvas anchor. Either { x, y } or { node_id }.',
          properties: { x: { type: 'number' }, y: { type: 'number' }, node_id: { type: 'string' } },
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: { type: 'boolean', description: 'Return raw upstream payload. Default false.' },
      },
      required: ['fileKey', 'message'],
    },
    annotations: {
      readOnlyHint: false,
      // delete-comment removes it.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { fileKey, message, parentCommentId, clientMeta, fields, includeRaw } = args as {
        fileKey: string;
        message: string;
        parentCommentId?: string;
        clientMeta?: ClientMeta;
        fields?: string[];
        includeRaw?: boolean;
      };

      const safeKey = validateFileKey(fileKey);
      if (typeof message !== 'string' || message.trim().length === 0)
        throw new Error('message must be a non-empty string');

      const body = sanitiseBody(
        { message: message.trim(), comment_id: parentCommentId, client_meta: clientMeta },
        { stripNull: true },
      );

      const raw = await figmaRequest<RawCommentResponse>(`/files/${safeKey}/comments`, ctx, {
        method: 'POST',
        body,
      });

      const shaped = {
        id: raw.id,
        message: raw.message,
        createdAt: raw.created_at,
        user: raw.user?.handle ?? 'Unknown',
        resolved: raw.resolved_at != null,
        parentId: raw.parent_id || undefined,
        clientMeta: raw.client_meta,
      };

      return resolveFields(shaped as any, raw, {
        includeRaw,
        fields,
        defaultFields: COMMENT_FIELDS,
      });
    },
  });
}
