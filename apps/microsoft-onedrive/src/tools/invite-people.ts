import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, requireItemRef } from '../lib/index.js';

/** invite-people — POST {itemRef}/invite. */
export function registerInvitePeopleTool(app: AgentApp): void {
  app.tool('invite-people', {
    description:
      'Share a OneDrive item with specific people by email, granting read or write access.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Item ID. Takes precedence over path.' },
        path: {
          type: 'string',
          description:
            'Item path relative to the drive root. Pass literal file and folder names, not pre-encoded ones.',
        },
        emails: {
          type: 'string',
          description: 'Comma-separated email addresses to invite',
        },
        role: { type: 'string', description: 'Access level: "read" (default) or "write".' },
        message: { type: 'string', description: 'Optional message included in the invitation' },
        requireSignIn: {
          type: 'boolean',
          description: 'Whether recipients must sign in (default: true)',
        },
        sendInvitation: {
          type: 'boolean',
          description: 'Whether to email the invitation (default: true)',
        },
      },
      required: ['emails'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const recipients = (a.emails as string)
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
        .map((address) => ({ email: address }));

      const response = await graphRequest<{ value?: any[] }>(
        'POST',
        `${requireItemRef(a)}/invite`,
        {
          recipients,
          roles: [(a.role as string) || 'read'],
          requireSignIn: a.requireSignIn !== false,
          sendInvitation: a.sendInvitation !== false,
          message: (a.message as string) || '',
        },
      );

      return {
        success: true,
        account: email,
        invited: recipients.map((r) => r.email),
        count: (response.value || []).length,
      };
    },
  });
}
