import type { AgentApp } from '@agentapps/sdk';
import { assertSize, createGraphClient, requireItemRef } from '../lib/index.js';

/** Cap on inline content, so a large file cannot flood the agent's context. */
const MAX_INLINE_BYTES = 1024 * 1024;

/** Textual application/* subtypes that are safe to decode as UTF-8 text. */
const TEXTUAL_APPLICATION_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-yaml',
]);

/**
 * Whether a mimeType is safe to decode as UTF-8 text. A missing/empty
 * mimeType is allowed through (Graph does not always report one). Anything
 * else that is not recognizably textual is refused, so a binary file does
 * not silently come back as mojibake.
 */
function isTextMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return true;
  const type = mimeType.split(';')[0].trim().toLowerCase();
  if (type.startsWith('text/')) return true;
  if (TEXTUAL_APPLICATION_TYPES.has(type)) return true;
  if (type.endsWith('+json') || type.endsWith('+xml')) return true;
  return false;
}

/** get-file-content — GET {itemRef}/content, returned inline as text. */
export function registerGetFileContentTool(app: AgentApp): void {
  app.tool('get-file-content', {
    description:
      'Read the contents of a text-based OneDrive file inline, without saving it to disk. Limited to 1 MB.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Item ID. Takes precedence over path.' },
        path: {
          type: 'string',
          description:
            'File path relative to the drive root. Pass literal file and folder names, not pre-encoded ones.',
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
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const base = requireItemRef(a);

      const meta = await graphRequest<Record<string, any>>(
        'GET',
        `${base}?$select=id,name,size,file`,
      );
      assertSize(meta.size ?? 0, `"${meta.name}"`);
      if ((meta.size ?? 0) > MAX_INLINE_BYTES) {
        throw new Error(
          `"${meta.name}" is larger than 1 MB. Use download-file to save it to disk instead.`,
        );
      }
      if (!isTextMimeType(meta.file?.mimeType)) {
        throw new Error(
          `"${meta.name}" is ${meta.file.mimeType}, which is not text. Use download-file to save it to disk instead.`,
        );
      }

      const buffer: Buffer = await graphRequest<Buffer>('GET', `${base}/content`, undefined, {
        responseType: 'buffer',
      });

      return {
        account: email,
        name: meta.name,
        mimeType: meta.file?.mimeType,
        size: meta.size,
        content: buffer.toString('utf-8'),
      };
    },
  });
}
