import type { AgentApp } from '@agentapps/sdk';
import {
  type Args,
  readBrandId,
  readLocalDateTime,
  readOneOf,
  readText,
  readTimezone,
} from './args.js';
import { apiRequest } from './client.js';
import { type Envelope, NETWORK_DATA_KEYS, POST_NETWORKS, type ScheduledPost } from './posts.js';

interface CreatePostTool {
  name: string;
  description: string;
  /** `true` saves a draft Metricool never publishes; `false` schedules and auto-publishes. */
  draft: boolean;
  destructive: boolean;
}

/** Text limits Metricool's own MCP server enforces before it sends a post. */
const TEXT_LIMITS: Record<string, { label: string; max: number }> = {
  twitter: { label: 'X', max: 280 },
  bluesky: { label: 'Bluesky', max: 300 },
};

function readNetworks(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      `[BAD_REQUEST] Specify networks as a non-empty array of ${POST_NETWORKS.join(', ')}. list-brands shows which ones a brand has connected.`,
    );
  }
  return [
    ...new Set(value.map((item, index) => readOneOf(item, `networks[${index}]`, POST_NETWORKS))),
  ];
}

function readMedia(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((url) => typeof url !== 'string' || !/^https?:\/\//.test(url))
  ) {
    throw new Error('[BAD_REQUEST] Specify media as an array of public http(s) URLs.');
  }
  return value as string[];
}

function readNetworkData(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      '[BAD_REQUEST] Specify networkData as an object such as { "instagramData": { "type": "REEL" } }.',
    );
  }
  for (const key of Object.keys(value)) {
    // Only the per-network objects pass through; the post's own fields have arguments.
    if (!NETWORK_DATA_KEYS.includes(key)) {
      throw new Error(
        `[BAD_REQUEST] networkData.${key} is not a network data key. Use one of ${NETWORK_DATA_KEYS.join(', ')}.`,
      );
    }
  }
  return value as Record<string, unknown>;
}

/**
 * Registers one of the two tools that create posts. They differ only in the `draft` flag
 * sent to POST /v2/scheduler/posts, and are separate tools so each has annotations that
 * are true for it.
 */
export function registerCreatePostTool(app: AgentApp, tool: CreatePostTool): void {
  /** @spec METRICOOL-REQ-6 */
  app.tool(tool.name, {
    description: tool.description,
    parameters: {
      type: 'object',
      properties: {
        brandId: { type: ['number', 'string'], description: 'Brand id, from list-brands.' },
        text: { type: 'string', description: 'The text of the post.' },
        date: {
          type: 'string',
          description:
            'Publication date as a local date-time in `timezone`, YYYY-MM-DDTHH:mm:ss, e.g. 2026-12-01T09:00:00.',
        },
        timezone: {
          type: 'string',
          description:
            "IANA timezone of `date`, e.g. Europe/Madrid. list-brands gives the brand's.",
        },
        networks: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', enum: [...POST_NETWORKS] },
          description:
            'Networks to post to; each must be connected to the brand (see list-brands). "twitter" is X, "gmb" is Google Business Profile.',
        },
        media: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Public URLs of images or videos. Instagram, TikTok, Pinterest and YouTube posts need media.',
        },
        firstComment: {
          type: 'string',
          description: 'Text of the first comment, where the network has one.',
        },
        networkData: {
          type: 'object',
          description:
            'Per-network options, sent to Metricool unchanged. Keys are <network>Data, e.g. { "instagramData": { "type": "POST" | "REEL" | "STORY" }, "facebookData": { "type": "POST" | "REEL" | "STORY" }, "linkedinData": { "type": "post" }, "youtubeData": { "title": "...", "type": "video" | "short", "privacy": "public", "madeForKids": false }, "pinterestData": { "boardId": "...", "pinTitle": "..." }, "tiktokData": { "privacyOption": "PUBLIC_TO_EVERYONE" } }. YouTube requires title and madeForKids; Pinterest requires boardId.',
        },
      },
      required: ['brandId', 'text', 'date', 'timezone', 'networks'],
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
      const blogId = readBrandId(a.brandId);
      const text = readText(a.text, 'text');
      const dateTime = readLocalDateTime(a.date, 'date');
      const timezone = readTimezone(a.timezone);
      const networks = readNetworks(a.networks);
      const media = readMedia(a.media);
      const networkData = readNetworkData(a.networkData);
      if (
        a.firstComment !== undefined &&
        a.firstComment !== null &&
        typeof a.firstComment !== 'string'
      ) {
        throw new Error('[BAD_REQUEST] Specify firstComment as text.');
      }
      for (const network of networks) {
        const limit = TEXT_LIMITS[network];
        if (limit && text.length > limit.max) {
          throw new Error(
            `[BAD_REQUEST] The text has ${text.length} characters and ${limit.label} allows ${limit.max}. Shorten it or leave ${network} out; nothing was sent.`,
          );
        }
      }
      const created = await apiRequest<Envelope<ScheduledPost>>(
        'POST',
        '/v2/scheduler/posts',
        ctx,
        {
          params: { blogId },
          body: {
            ...networkData,
            text,
            publicationDate: { dateTime, timezone },
            providers: networks.map((network) => ({ network })),
            autoPublish: !tool.draft,
            draft: tool.draft,
            ...(media === undefined ? {} : { media }),
            ...(typeof a.firstComment === 'string' ? { firstCommentText: a.firstComment } : {}),
          },
        },
      );
      return {
        success: true,
        id: created?.data?.id ?? null,
        date: dateTime,
        timezone,
        networks,
      };
    },
  });
}
