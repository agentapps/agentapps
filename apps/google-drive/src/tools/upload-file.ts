import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import {
  ALL_DRIVES,
  ensureAuthenticated,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';
import { extToMime, GOOGLE_NATIVE_MIME, type GoogleNativeTarget } from './_mime.js';

export function registerUploadFileTool(app: AgentApp): void {
  app.tool('upload-file', {
    description:
      'Upload a local file to Google Drive. By default the file is stored as-is with its real type. Pass convertTo to import it as a native Google file (e.g. an HTML/Word file -> editable Google Doc).',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Local path of the file to upload',
        },
        parentFolderId: {
          type: 'string',
          description: 'Optional: ID of the folder to upload to (default: root)',
        },
        fileName: {
          type: 'string',
          description: 'Optional: Custom name for the file (default: original filename)',
        },
        convertTo: {
          type: 'string',
          enum: ['document', 'spreadsheet', 'presentation'],
          description:
            'Optional: convert the upload into a native Google file. "document" (e.g. from HTML/Word/Markdown) -> editable Google Doc; "spreadsheet" (from CSV/Excel) -> Google Sheet; "presentation" (from PPTX) -> Google Slides. Omit to keep the original format.',
        },
      },
      required: ['filePath'],
    },
    // Reads a file from the user's machine and creates a new Drive file; nothing is overwritten.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { filePath, parentFolderId, fileName, convertTo } = args as {
        filePath: string;
        parentFolderId?: string;
        fileName?: string;
        convertTo?: GoogleNativeTarget;
      };

      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      if (convertTo && !(convertTo in GOOGLE_NATIVE_MIME)) {
        throw new Error(
          `Invalid convertTo "${convertTo}". Expected one of: ${Object.keys(GOOGLE_NATIVE_MIME).join(', ')}.`,
        );
      }

      const name = fileName || basename(filePath);

      return withAuthRetry(
        ctx,
        async () => {
          const fileMetadata: { name: string; parents?: string[]; mimeType?: string } = { name };

          if (parentFolderId) {
            fileMetadata.parents = [parentFolderId];
          }

          if (convertTo) {
            fileMetadata.mimeType = GOOGLE_NATIVE_MIME[convertTo];
          }

          const media = {
            mimeType: extToMime(filePath),
            body: createReadStream(filePath),
          };

          const response = await clients.drive.files.create({
            ...ALL_DRIVES,
            requestBody: fileMetadata,
            media,
            fields: 'id, name, mimeType, size, webViewLink',
          });

          return response.data;
        },
        'upload-file',
      );
    },
  });
}
