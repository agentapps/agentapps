import type { AgentApp } from '@agentapps/sdk';
import { ZendeskApiError } from '../lib/_zendesk-error.js';

/**
 * upload-attachment — POST /uploads.json.
 *
 * This tool reads the file from disk and uploads it to Zendesk as a binary
 * attachment. It accesses credentials directly (not via zendeskRequest) because
 * the upload uses a binary content type rather than JSON.
 */
export function registerUploadAttachmentTool(app: AgentApp): void {
  app.tool('upload-attachment', {
    description:
      'Upload a file attachment to Zendesk for use in ticket comments. Returns upload token. Params: filePath, fileName?.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file to upload.',
        },
        fileName: {
          type: 'string',
          description: 'Desired filename for the attachment. Defaults to basename of filePath.',
        },
      },
      required: ['filePath'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { filePath, fileName } = args as {
        filePath: string;
        fileName?: string;
      };

      const fs = await import('node:fs');
      const path = await import('node:path');
      const resolvedPath = path.resolve(filePath);
      const name = fileName || path.basename(resolvedPath);
      const fileBuffer = fs.readFileSync(resolvedPath);

      let secrets: Record<string, string> = {};
      try {
        const installationSecrets = await ctx.secrets.getInstallation();
        if (installationSecrets) secrets = installationSecrets;
      } catch {
        // fall through
      }

      const subdomain = secrets.SUBDOMAIN;
      const email = secrets.EMAIL;
      const apiToken = secrets.API_TOKEN;

      if (!subdomain || !email || !apiToken) {
        throw new ZendeskApiError('AUTH_INVALID', 401, 'Zendesk credentials not configured.', {
          type: 'user_action',
          description: 'Configure SUBDOMAIN, EMAIL, and API_TOKEN in app settings.',
        });
      }

      const uploadUrl = new URL(`https://${subdomain.trim()}.zendesk.com/api/v2/uploads.json`);
      uploadUrl.searchParams.set('filename', name);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      try {
        const response = await fetch(uploadUrl.toString(), {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${email.trim()}/token:${apiToken.trim()}`)}`,
            'Content-Type': 'application/binary',
          },
          body: fileBuffer,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new ZendeskApiError(
            'PROVIDER_ERROR',
            response.status,
            `Zendesk upload error: ${errorText}`,
            {
              type: 'auto_retry',
              description: 'File upload to Zendesk failed.',
            },
          );
        }

        const result = (await response.json()) as any;
        return {
          token: result.upload?.token,
          attachment: result.upload?.attachment,
          expiresAt: result.upload?.expires_at,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
