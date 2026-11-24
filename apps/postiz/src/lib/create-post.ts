import type { AgentApp } from '@agentapps/sdk';
import { type Args, readId, readIsoDate } from './args.js';
import { apiRequest } from './client.js';

/** The `type` Postiz takes on POST /posts. */
export type PostType = 'draft' | 'schedule' | 'now';

interface CreatePostTool {
  name: string;
  type: PostType;
  description: string;
  /** Whether the tool takes `date`, and whether it is required. */
  date: 'none' | 'optional' | 'required';
  destructive: boolean;
}

const CHANNELS_SCHEMA = {
  type: 'array',
  minItems: 1,
  description: 'One entry per channel to post to.',
  items: {
    type: 'object',
    properties: {
      id: {
        type: ['string', 'number'],
        description: 'Channel id, from list-channels.',
      },
      content: { type: 'string', description: 'The text of the post on this channel.' },
      media: {
        type: 'array',
        description:
          'Images or videos to attach, as returned by upload-media-from-url: [{ id, url }].',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Media id.' },
            url: { type: 'string', description: 'Media URL in the Postiz library.' },
          },
          required: ['id', 'url'],
        },
      },
      settings: {
        type: 'object',
        description:
          'Provider settings, sent to Postiz unchanged. "__type" is the channel\'s provider from list-channels; some providers require more, e.g. { "__type": "x", "who_can_reply_post": "everyone" }, { "__type": "linkedin" }, { "__type": "instagram", "post_type": "post" }, { "__type": "youtube", "title": "...", "type": "public" }.',
      },
    },
    required: ['id', 'content'],
  },
} as const;

function readChannels(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      '[BAD_REQUEST] Specify channels as a non-empty array of { id, content }. Get the ids with list-channels.',
    );
  }
  return value.map((raw, index) => {
    const entry = (raw ?? {}) as Args;
    const id = readId(entry.id, `channels[${index}].id`);
    if (typeof entry.content !== 'string') {
      throw new Error(`[BAD_REQUEST] Specify channels[${index}].content as text.`);
    }
    const media = entry.media === undefined ? [] : entry.media;
    if (!Array.isArray(media)) {
      throw new Error(`[BAD_REQUEST] Specify channels[${index}].media as an array of { id, url }.`);
    }
    const image = media.map((item) => {
      const m = (item ?? {}) as Args;
      if (typeof m.id !== 'string' || typeof m.url !== 'string' || !m.id || !m.url) {
        throw new Error(
          `[BAD_REQUEST] Each channels[${index}].media entry needs the id and url returned by upload-media-from-url.`,
        );
      }
      return { id: m.id, path: m.url };
    });
    const settings = entry.settings;
    if (
      settings !== undefined &&
      (settings === null || typeof settings !== 'object' || Array.isArray(settings))
    ) {
      throw new Error(`[BAD_REQUEST] Specify channels[${index}].settings as an object.`);
    }
    return {
      integration: { id },
      value: [{ content: entry.content, image }],
      ...(settings === undefined ? {} : { settings }),
    };
  });
}

/**
 * Registers one of the three tools that create posts. They differ only in the `type` sent
 * to POST /posts, and are separate tools so each has annotations that are true for it.
 */
export function registerCreatePostTool(app: AgentApp, tool: CreatePostTool): void {
  const dateProperty =
    tool.date === 'none'
      ? {}
      : {
          date: {
            type: 'string',
            description:
              tool.date === 'required'
                ? 'When to publish, ISO 8601, in the future, e.g. 2026-12-01T09:00:00Z.'
                : 'Planned publish date, ISO 8601, e.g. 2026-12-01T09:00:00Z. Optional.',
          },
        };
  /** @spec POSTIZ-REQ-6 */
  app.tool(tool.name, {
    description: tool.description,
    parameters: {
      type: 'object',
      properties: { channels: CHANNELS_SCHEMA, ...dateProperty },
      required: tool.date === 'required' ? ['channels', 'date'] : ['channels'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: tool.destructive,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      let date: string;
      if (tool.date === 'required') {
        if (a.date === undefined || a.date === null || a.date === '') {
          throw new Error(
            '[BAD_REQUEST] Specify date, the ISO 8601 time to publish at. Use publish-post to publish now.',
          );
        }
        date = readIsoDate(a.date, 'date');
        if (Date.parse(date) <= Date.now()) {
          throw new Error(
            `[BAD_REQUEST] date must be in the future; got ${date}. Use publish-post to publish now.`,
          );
        }
      } else if (tool.date === 'optional' && a.date !== undefined && a.date !== null) {
        date = readIsoDate(a.date, 'date');
      } else {
        // Postiz requires `date` on every request, also for a draft or an immediate post.
        date = new Date().toISOString();
      }
      const posts = readChannels(a.channels);
      const created = await apiRequest<Array<{ postId?: string; integration?: string }>>(
        'POST',
        '/posts',
        ctx,
        // `shortLink` and `tags` are required by Postiz; this app sets neither.
        { body: { type: tool.type, date, shortLink: false, tags: [], posts } },
      );
      return {
        success: true,
        posts: (Array.isArray(created) ? created : []).map((post) => ({
          postId: post.postId,
          channelId: post.integration,
        })),
      };
    },
  });
}
