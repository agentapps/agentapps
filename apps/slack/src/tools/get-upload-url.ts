import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface GetUploadUrlArgs {
  filename: string;
  length: number;
  altTxt?: string;
  snippetType?: string;
  includeRaw?: boolean;
}

export function registerGetUploadUrlTool(app: AgentApp): void {
  app.tool('get-upload-url', {
    description:
      "Step 1 of Slack's modern multi-step upload: get a pre-signed external URL + uploadId. PUT the file bytes to the URL, then call complete-upload with the uploadId. Use this for files >100MB or when progress tracking is needed. Returns { uploadUrl, fileId, length }. Params: filename, length (bytes), altTxt?, snippetType?.",
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Local filename (used for type detection).' },
        length: { type: 'number', description: 'File size in bytes (required by Slack).' },
        altTxt: { type: 'string', description: 'Alt text for accessibility (images).' },
        snippetType: {
          type: 'string',
          description: "Language for code snippets (e.g., 'javascript', 'python').",
        },
      },
      required: ['filename', 'length'],
    },
    // Reserves an upload slot that changes nothing visible until complete-upload runs;
    // each call returns a new URL and file id, so it is not idempotent.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { filename, length, altTxt, snippetType, includeRaw } =
        args as unknown as GetUploadUrlArgs;
      if (typeof filename !== 'string' || filename.trim().length === 0) {
        throw new Error('filename must be a non-empty string.');
      }
      if (typeof length !== 'number' || length <= 0) {
        throw new Error('length must be a positive number (bytes).');
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.files.getUploadURLExternal(
          sanitiseBody({
            filename,
            length,
            alt_txt: altTxt,
            snippet_type: snippetType,
          }) as any,
        ),
      );
      if (includeRaw) return result;
      return {
        uploadUrl: (result as any).upload_url ?? '',
        fileId: (result as any).file_id ?? '',
        filename,
        length,
      };
    },
  });
}
