import type { AgentApp } from '@agentapps/sdk';
import { figmaRequest } from '../lib/index.js';
import { COMMENT_FIELDS } from './_fields.js';
import { resolveFieldsList, validateFileKey } from './utils.js';

interface RawComment {
  id: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
  user?: { handle?: string; img_url?: string } | null;
  parent_id?: string;
  client_meta?: {
    x?: number;
    y?: number;
    node_id?: string;
    node_offset?: { x: number; y: number };
  };
}

export function registerGetCommentsTool(app: AgentApp): void {
  app.tool('get-comments', {
    description:
      'List comments on a Figma file. Returns { comments: [{id, message, createdAt, user, resolved, parentId?, clientMeta?}], count }. Params: fileKey, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'The file key from a Figma URL.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per row.',
        },
        includeRaw: { type: 'boolean', description: 'Return raw upstream payload. Default false.' },
      },
      required: ['fileKey'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { fileKey, fields, includeRaw } = args as {
        fileKey: string;
        fields?: string[];
        includeRaw?: boolean;
      };

      const safeKey = validateFileKey(fileKey);
      const response = await figmaRequest<{ comments: RawComment[] }>(
        `/files/${safeKey}/comments`,
        ctx,
      );

      const raw = response.comments ?? [];
      const shaped = raw.map((c) => ({
        id: c.id,
        message: c.message,
        createdAt: c.created_at,
        user: c.user?.handle ?? 'Unknown',
        resolved: c.resolved_at != null,
        parentId: c.parent_id || undefined,
        clientMeta: c.client_meta,
      }));

      const comments = resolveFieldsList(shaped, raw, {
        includeRaw,
        fields,
        defaultFields: COMMENT_FIELDS,
      });
      return { comments, count: shaped.length };
    },
  });
}
