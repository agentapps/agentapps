import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * get-attachment — GET /attachments/{id}.json.
 */
export function registerGetAttachmentTool(app: AgentApp): void {
  app.tool('get-attachment', {
    description:
      'Get details of a Zendesk attachment by ID. Returns { id, fileName, contentUrl, size, contentType, createdAt }.',
    parameters: {
      type: 'object',
      properties: {
        attachmentId: {
          type: 'string',
          description: 'Zendesk attachment ID.',
        },
      },
      required: ['attachmentId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { attachmentId } = args as { attachmentId: string };

      const result = await zendeskRequest<any>(ctx, `/attachments/${attachmentId}.json`);
      const a = result.attachment;

      return {
        id: a.id,
        fileName: a.file_name,
        contentUrl: a.content_url,
        size: a.size,
        contentType: a.content_type,
        createdAt: a.created_at,
        thumbnails: (a.thumbnails ?? []).map((t: any) => ({
          id: t.id,
          contentUrl: t.content_url,
          width: t.width,
          height: t.height,
        })),
      };
    },
  });
}
