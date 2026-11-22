import type { AgentApp } from '@agentapps/sdk';
import { hunterGet } from '../lib/hunter-client.js';
import { requireEmail } from '../lib/validation.js';

interface RawEmailVerifier {
  email?: string;
  status?: string | null;
  result?: string | null;
  score?: number | null;
  regexp?: boolean;
  gibberish?: boolean;
  disposable?: boolean;
  webmail?: boolean;
  mx_records?: boolean;
  smtp_server?: boolean;
  smtp_check?: boolean;
  accept_all?: boolean;
  block?: boolean;
}

/**
 * email-verifier — GET /email-verifier.
 */
export function registerEmailVerifierTool(app: AgentApp): void {
  app.tool('email-verifier', {
    description:
      'Verify whether an email address is deliverable. Returns a status (valid / invalid / accept_all / webmail / disposable / unknown), a result (deliverable / risky / undeliverable) and a 0-100 score plus the underlying checks. Returns { email, status, result, score }.',
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'The email address to verify (e.g. "patrick@stripe.com").',
        },
      },
      required: ['email'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const email = requireEmail(a.email);

      const data = await hunterGet<RawEmailVerifier>(ctx, '/email-verifier', {
        query: { email },
      });

      if (!data || typeof data !== 'object') {
        throw new Error('[PROVIDER_ERROR] Hunter returned an unexpected email-verifier payload');
      }

      return {
        email: data.email ?? email,
        status: data.status ?? null,
        result: data.result ?? null,
        score: typeof data.score === 'number' ? data.score : null,
        gibberish: data.gibberish ?? false,
        disposable: data.disposable ?? false,
        webmail: data.webmail ?? false,
        acceptAll: data.accept_all ?? false,
        block: data.block ?? false,
        mxRecords: data.mx_records ?? false,
        smtpServer: data.smtp_server ?? false,
        smtpCheck: data.smtp_check ?? false,
      };
    },
  });
}
