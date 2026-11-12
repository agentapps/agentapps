/**
 * send-email — POST /mail/send
 *
 * Send a transactional email via the SendGrid v3 API. The sender must be a
 * verified sender identity or domain in the SendGrid account.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

export function registerSendEmailTool(app: AgentApp): void {
  app.tool('send-email', {
    description:
      'Send an email via SendGrid (POST /mail/send). The "from" address must be a verified sender identity. Provide at least one of textContent or htmlContent.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address.',
        },
        from: {
          type: 'string',
          description: 'Verified sender email address.',
        },
        subject: {
          type: 'string',
          description: 'Email subject line.',
        },
        textContent: {
          type: 'string',
          description: 'Plain-text body. At least one of textContent / htmlContent is required.',
        },
        htmlContent: {
          type: 'string',
          description: 'HTML body. At least one of textContent / htmlContent is required.',
        },
      },
      required: ['to', 'from', 'subject'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      const to = args.to as string;
      const from = args.from as string;
      const subject = args.subject as string;
      const textContent = args.textContent as string | undefined;
      const htmlContent = args.htmlContent as string | undefined;

      if (!textContent && !htmlContent) {
        throw new Error('At least one of textContent or htmlContent is required.');
      }

      const content: Array<{ type: string; value: string }> = [];
      if (textContent) content.push({ type: 'text/plain', value: textContent });
      if (htmlContent) content.push({ type: 'text/html', value: htmlContent });

      const body = {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content,
      };

      await sendgridRequest('POST', '/mail/send', body, ctx);

      return {
        success: true,
        to,
        from,
        subject,
      };
    },
  });
}
