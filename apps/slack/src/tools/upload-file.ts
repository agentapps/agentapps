import { readFileSync } from 'node:fs';
import { basename, resolve as resolvePath } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { FILE_FIELDS } from './_fields.js';
import {
  cleanOptionalString,
  extractFile,
  validateChannelId,
  validateMessageTs,
} from './_helpers.js';
import { resolveFields, sanitiseBody, wrapSlackMutation } from './utils.js';

interface UploadFileArgs {
  filePath: string;
  channels?: string[];
  title?: string;
  initialComment?: string;
  threadTs?: string;
  fields?: string[];
  includeRaw?: boolean;
}

/**
 * Maximum file size we accept inline. Slack itself caps free workspaces at
 * 1 GB / file but reading 1 GB into a Buffer is impractical. Cap at 100 MB
 * which covers the common case (images, PDFs, screen recordings).
 */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function registerUploadFileTool(app: AgentApp): void {
  app.tool('upload-file', {
    description:
      'Upload a local file to Slack and optionally share it. Returns the curated file (id, name, mimetype, size, permalink, thumbUrl). Path must resolve to an absolute path. Not retryable. Params: filePath, channels?[], title?, initialComment?, threadTs?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the local file (≤100 MB).',
        },
        channels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Slack channel ids to share to. Single id is fine.',
        },
        title: {
          type: 'string',
          description: 'Optional file title (defaults to basename).',
        },
        initialComment: {
          type: 'string',
          description: 'Optional comment posted alongside the file.',
        },
        threadTs: {
          type: 'string',
          description: 'Optional parent message ts to share inside a thread.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist on the returned file.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Slack file object. Default false.',
        },
      },
      required: ['filePath'],
    },
    // Reads a local file and, with channels, posts it and initialComment to them: a send
    // cannot be undone.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { filePath, channels, title, initialComment, threadTs, fields, includeRaw } =
        args as unknown as UploadFileArgs;
      if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        throw new Error('filePath must be a non-empty string.');
      }
      const absolute = resolvePath(filePath);
      if (absolute !== filePath) {
        throw new Error(`filePath must be absolute. Got "${filePath}", expected "${absolute}".`);
      }

      const cleanThreadTs = cleanOptionalString(threadTs);
      if (cleanThreadTs) validateMessageTs(cleanThreadTs, 'threadTs');
      if (Array.isArray(channels)) {
        for (const [i, id] of channels.entries()) validateChannelId(id, `channels[${i}]`);
      }

      let fileData: Buffer;
      try {
        fileData = readFileSync(absolute);
      } catch (err) {
        throw new Error(
          `Could not read file at "${absolute}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (fileData.byteLength > MAX_FILE_BYTES) {
        throw new Error(
          `File "${absolute}" is ${fileData.byteLength} bytes (>100 MB cap). Use Slack's external file URL flow instead.`,
        );
      }

      const filename = basename(absolute);
      const cleanTitle = cleanOptionalString(title);
      const cleanComment = cleanOptionalString(initialComment);

      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.files.uploadV2(
          sanitiseBody({
            file: fileData,
            filename,
            title: cleanTitle ?? filename,
            channel_id:
              Array.isArray(channels) && channels.length > 0 ? channels.join(',') : undefined,
            initial_comment: cleanComment,
            thread_ts: cleanThreadTs,
          }) as any,
        ),
      );

      // uploadV2 returns either { file } or { files: [{ files: [...] }] } depending
      // on flavour. Normalise to the first file we can find.
      const firstFile =
        (result as any).file ??
        (result as any).files?.[0]?.files?.[0] ??
        (result as any).files?.[0] ??
        null;
      if (!firstFile) {
        throw new Error('Slack files.uploadV2 returned no file.');
      }
      const shape = extractFile(firstFile);
      return resolveFields(shape as any, firstFile, {
        includeRaw,
        fields,
        defaultFields: FILE_FIELDS,
      });
    },
  });
}
