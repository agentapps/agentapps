/**
 * validate-email — POST /validations/email
 *
 * Validate an email address using the SendGrid Email Validation API.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

interface ValidateEmailResponse {
  result?: unknown;
}

export function registerValidateEmailTool(app: AgentApp): void {
  app.tool('validate-email', {
    description:
      'Validate an email address using SendGrid Email Validation (POST /validations/email). Returns validation result with verdict, score, and checks. Requires Email Validation on the SendGrid plan.',
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'The email address to validate.',
        },
        source: {
          type: 'string',
          description: 'Optional identifier for the source of the email (e.g. "signup", "import").',
        },
      },
      required: ['email'],
    },
    // A POST that only asks SendGrid for a verdict on an address; nothing is written or sent.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const email = args.email as string;
      const source = args.source as string | undefined;

      if (!email) {
        throw new Error('Email address is required.');
      }

      const body: Record<string, string> = { email };
      if (source) body.source = source;

      const res = (await sendgridRequest(
        'POST',
        '/validations/email',
        body,
        ctx,
      )) as ValidateEmailResponse;

      return res.result ?? res;
    },
  });
}
