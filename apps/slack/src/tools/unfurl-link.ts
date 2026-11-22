import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId, validateMessageTs } from './_helpers.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface UnfurlLinkArgs {
  channel: string;
  ts: string;
  unfurls: string;
  userAuthRequired?: boolean;
  userAuthUrl?: string;
  userAuthMessage?: string;
}

export function registerUnfurlLinkTool(app: AgentApp): void {
  app.tool('unfurl-link', {
    description:
      'Provide custom unfurl content for links posted in a message (replaces Slack\'s default preview). unfurls is a JSON map: {"https://your.url":{"blocks":[...],"text":"..."}}. Returns { channel, ts, unfurled: true }. Not retryable. Params: channel, ts, unfurls (JSON), userAuthRequired?, userAuthUrl?, userAuthMessage?.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id of the message that has the link.' },
        ts: { type: 'string', description: 'Message ts.' },
        unfurls: {
          type: 'string',
          description: 'JSON object: {"https://link":{"blocks":[...], "text":"fallback"}}',
        },
        userAuthRequired: {
          type: 'boolean',
          description:
            "Mark this unfurl as requiring user OAuth (Slack will show 'Sign in' button).",
        },
        userAuthUrl: { type: 'string', description: 'Sign-in URL when userAuthRequired.' },
        userAuthMessage: { type: 'string', description: 'Message to show on sign-in prompt.' },
      },
      required: ['channel', 'ts', 'unfurls'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as unknown as UnfurlLinkArgs;
      validateChannelId(a.channel, 'channel');
      validateMessageTs(a.ts, 'ts');
      let parsedUnfurls: Record<string, unknown>;
      try {
        const parsed = JSON.parse(a.unfurls);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('unfurls must parse to a JSON object.');
        }
        parsedUnfurls = parsed as Record<string, unknown>;
      } catch (err) {
        throw new Error(
          `Invalid unfurls JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        client.chat.unfurl(
          sanitiseBody({
            channel: a.channel,
            ts: a.ts,
            unfurls: parsedUnfurls,
            user_auth_required: a.userAuthRequired,
            user_auth_url: a.userAuthUrl,
            user_auth_message: a.userAuthMessage,
          }) as any,
        ),
      );
      return {
        channel: a.channel,
        ts: a.ts,
        unfurled: true,
        links: Object.keys(parsedUnfurls),
      };
    },
  });
}
