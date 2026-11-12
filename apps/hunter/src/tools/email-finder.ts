import type { AgentApp } from '@agentapps/sdk';
import { hunterGet } from '../lib/hunter-client.js';
import { requireDomain, requireNonEmpty } from '../lib/validation.js';

interface RawEmailFinder {
  email?: string | null;
  score?: number | null;
  domain?: string;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
  twitter?: string | null;
  phone_number?: string | null;
  verification?: { status?: string | null; date?: string | null } | null;
}

/**
 * email-finder — GET /email-finder.
 */
export function registerEmailFinderTool(app: AgentApp): void {
  app.tool('email-finder', {
    description:
      "Guess a specific person's professional email from their first/last name and company domain. Returns the most likely email with a confidence score (0-100). Returns { email, score, domain, firstName, lastName, position }.",
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Company domain (e.g. "stripe.com"). A full URL is also accepted.',
        },
        first_name: { type: 'string', description: "The person's first name." },
        last_name: { type: 'string', description: "The person's last name." },
      },
      required: ['domain', 'first_name', 'last_name'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const domain = requireDomain(a.domain);
      const firstName = requireNonEmpty(a.first_name, 'first_name');
      const lastName = requireNonEmpty(a.last_name, 'last_name');

      const data = await hunterGet<RawEmailFinder>(ctx, '/email-finder', {
        query: { domain, first_name: firstName, last_name: lastName },
      });

      if (!data || typeof data !== 'object') {
        throw new Error('[PROVIDER_ERROR] Hunter returned an unexpected email-finder payload');
      }

      return {
        email: data.email ?? null,
        score: typeof data.score === 'number' ? data.score : null,
        domain: data.domain ?? domain,
        firstName: data.first_name ?? firstName,
        lastName: data.last_name ?? lastName,
        position: data.position ?? null,
        company: data.company ?? null,
        linkedin: data.linkedin_url ?? null,
        twitter: data.twitter ?? null,
        phoneNumber: data.phone_number ?? null,
        verificationStatus: data.verification?.status ?? null,
      };
    },
  });
}
