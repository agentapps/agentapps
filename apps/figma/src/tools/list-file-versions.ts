import type { AgentApp } from '@agentapps/sdk';
import { figmaRequest } from '../lib/index.js';
import { VERSION_FIELDS } from './_fields.js';
import { resolveFieldsList, sanitizeNumber, validateFileKey } from './utils.js';

interface RawVersion {
  id: string;
  created_at: string;
  label: string | null;
  description: string | null;
  user?: { handle?: string; img_url?: string };
  thumbnail_url?: string;
}

interface VersionsResponse {
  versions: RawVersion[];
  pagination?: { prev_page?: string; next_page?: string };
}

export function registerListFileVersionsTool(app: AgentApp): void {
  app.tool('list-file-versions', {
    description:
      'List the version history of a Figma file. Returns { versions, count, nextPage? }. Params: fileKey, pageSize (1-50, def 30), before?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'The file key from a Figma URL.' },
        pageSize: { type: 'number', description: 'Versions per page. Min 1, max 50, default 30.' },
        before: { type: 'string', description: 'Opaque cursor from a previous response.nextPage.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per row.',
        },
        includeRaw: { type: 'boolean', description: 'Return raw upstream payload. Default false.' },
      },
      required: ['fileKey'],
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    handler: async (args, ctx) => {
      const { fileKey, pageSize, before, fields, includeRaw } = args as {
        fileKey: string;
        pageSize?: number;
        before?: string;
        fields?: string[];
        includeRaw?: boolean;
      };

      const safeKey = validateFileKey(fileKey);
      const safePageSize = sanitizeNumber(pageSize, {
        min: 1,
        max: 50,
        default: 30,
        integer: true,
      });

      const params = new URLSearchParams({ page_size: String(safePageSize) });
      if (before) params.set('before', before);

      const response = await figmaRequest<VersionsResponse>(
        `/files/${safeKey}/versions?${params.toString()}`,
        ctx,
      );

      const raw = response.versions ?? [];
      const shaped = raw.map((v) => ({
        id: v.id,
        createdAt: v.created_at,
        label: v.label ?? '',
        description: v.description ?? '',
        user: v.user?.handle ?? 'Unknown',
        thumbnailUrl: v.thumbnail_url,
      }));

      const versions = resolveFieldsList(shaped, raw, {
        includeRaw,
        fields,
        defaultFields: VERSION_FIELDS,
      });
      return { versions, count: shaped.length, nextPage: response.pagination?.next_page ?? null };
    },
  });
}
