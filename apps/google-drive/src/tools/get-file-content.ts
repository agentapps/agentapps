import type { AgentApp } from '@agentapps/sdk';
import {
  ALL_DRIVES,
  ensureAuthenticated,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';
import { isTextualMimeType } from './_mime.js';

async function streamToString(stream: AsyncIterable<Buffer>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export function registerGetFileContentTool(app: AgentApp): void {
  app.tool('get-file-content', {
    description:
      'Get the plain-text content of a Google Doc or text file. Does NOT extract text from binary files (PDF, Word, etc.) — for those, download the file and use the file-processor "file-to-markdown" tool.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the file to read',
        },
        mimeType: {
          type: 'string',
          description:
            "Optional: Export MIME type for Google Docs (e.g., 'text/plain', 'text/html')",
        },
      },
      required: ['fileId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { fileId, mimeType: exportMimeType } = args as {
        fileId: string;
        mimeType?: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const fileInfo = await clients.drive.files.get({
            ...ALL_DRIVES,
            fileId,
            fields: 'mimeType, name',
          });

          let content: string;

          if (fileInfo.data.mimeType?.includes('google-apps')) {
            const mimeType = exportMimeType || 'text/plain';
            const response = await clients.drive.files.export(
              { fileId, mimeType },
              { responseType: 'stream' },
            );
            content = await streamToString(response.data as AsyncIterable<Buffer>);
          } else {
            const fileMimeType = fileInfo.data.mimeType ?? '';
            if (!isTextualMimeType(fileMimeType)) {
              throw new Error(
                `[UNSUPPORTED_BINARY] "${fileInfo.data.name}" is a binary file (${fileMimeType || 'unknown type'}) with no directly readable text. ` +
                  'get-file-content only returns plain-text or Google Docs content. ' +
                  'To read a PDF or Word document, download it with the download-file tool and then convert it to text with the file-processor "file-to-markdown" tool.',
              );
            }

            const response = await clients.drive.files.get(
              { ...ALL_DRIVES, fileId, alt: 'media' },
              { responseType: 'stream' },
            );
            content = await streamToString(response.data as AsyncIterable<Buffer>);
          }

          return {
            name: fileInfo.data.name,
            mimeType: fileInfo.data.mimeType,
            content,
          };
        },
        'get-file-content',
      );
    },
  });
}
