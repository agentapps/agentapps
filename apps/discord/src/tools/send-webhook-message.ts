import type { AgentApp } from '@agentapps/sdk';
import { getDiscordSession, handleDiscordError } from '../lib/index.js';

export function registerSendWebhookMessageTool(app: AgentApp): void {
  app.tool('send-webhook-message', {
    description:
      'Send a message via a webhook using the webhook URL. Supports text, embeds, and usernames.',
    parameters: {
      type: 'object',
      properties: {
        webhookId: { type: 'string', description: 'The ID of the webhook' },
        webhookToken: { type: 'string', description: 'The token of the webhook' },
        content: { type: 'string', description: 'The text content of the message' },
        username: { type: 'string', description: 'Override the webhook username' },
        avatarUrl: { type: 'string', description: 'Override the webhook avatar URL' },
        embeds: {
          type: 'string',
          description: 'JSON string of embed objects array (see Discord embed documentation)',
        },
        threadId: { type: 'string', description: 'Send the message to a specific thread' },
      },
      required: ['webhookId', 'webhookToken'],
    },
    // Destructive: a sent message cannot be unsent.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      try {
        const { rest } = await getDiscordSession(ctx);
        const body: Record<string, unknown> = {};
        if ((args as any).content) body.content = (args as any).content;
        if ((args as any).username) body.username = (args as any).username;
        if ((args as any).avatarUrl) body.avatar_url = (args as any).avatarUrl;
        if ((args as any).embeds) {
          try {
            body.embeds = JSON.parse((args as any).embeds);
          } catch {
            throw new Error('Invalid embeds JSON. Must be a valid JSON array of embed objects.');
          }
        }
        const url = `https://discord.com/api/v10/webhooks/${(args as any).webhookId}/${(args as any).webhookToken}${(args as any).threadId ? `?thread_id=${(args as any).threadId}` : ''}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Webhook request failed: ${response.status} ${errorText}`);
        }
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        return {
          success: true,
          id: data.id,
          channel_id: data.channel_id,
          content: data.content,
          message: 'Webhook message sent successfully',
        };
      } catch (error) {
        handleDiscordError(error, 'send webhook message');
      }
    },
  });
}
