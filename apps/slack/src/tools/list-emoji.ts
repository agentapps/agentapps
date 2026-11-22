import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackCall } from './utils.js';

interface CuratedEmoji {
  name: string;
  url: string;
  isAlias: boolean;
  aliasFor: string | null;
}

export function registerListEmojiTool(app: AgentApp): void {
  app.tool('list-emoji', {
    description:
      'List custom workspace emojis. Returns { emojis: [{ name, url, isAlias, aliasFor }], count }. Retryable. No params.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() => client.emoji.list());
      if ((args as any).includeRaw) return result;
      const rawEmoji = ((result as any).emoji ?? {}) as Record<string, string>;
      const emojis: CuratedEmoji[] = Object.entries(rawEmoji).map(([name, url]) => {
        const isAlias = url.startsWith('alias:');
        return {
          name,
          url,
          isAlias,
          aliasFor: isAlias ? url.slice('alias:'.length) : null,
        };
      });
      return { emojis, count: emojis.length };
    },
  });
}
