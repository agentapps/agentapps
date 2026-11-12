/**
 * Notion API Client Manager — adapted for Agent Apps SDK.
 *
 * Stateless: credentials are read from `ctx.secrets` on every call. A custom
 * `fetch` is injected into the Notion SDK — on 401 it refreshes the access
 * token via Notion's OAuth refresh_token grant and retries once.
 */

import type { ToolContext } from '@agentapps/sdk';
import { Client } from '@notionhq/client';
import { NotionApiError } from './notion-error.js';

type NotionFetchInit = {
  headers?: Record<string, string>;
  body?: string | FormData;
  method?: string;
};
type NotionFetch = (url: string, init?: NotionFetchInit) => Promise<Response>;

const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

export interface NotionSecrets {
  CLIENT_ID?: string;
  CLIENT_SECRET?: string;
  ACCESS_TOKEN?: string;
  REFRESH_TOKEN?: string;
  EXPIRY_DATE?: string;
}

async function loadNotionSecrets(ctx: ToolContext): Promise<NotionSecrets> {
  const [systemSecrets, installationSecrets] = await Promise.all([
    ctx.secrets.getSystem(),
    ctx.secrets.getInstallation(),
  ]);
  return { ...systemSecrets, ...installationSecrets } as NotionSecrets;
}

async function refreshNotionAccessToken(ctx: ToolContext, secrets: NotionSecrets): Promise<string> {
  const { CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN } = secrets;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new NotionApiError({
      code: 'SYSTEM_CONFIG_MISSING',
      action: {
        type: 'admin_action',
        description: 'Configure Notion CLIENT_ID and CLIENT_SECRET in system secrets.',
      },
      message: 'Notion OAuth CLIENT_ID and CLIENT_SECRET not configured.',
    });
  }
  if (!REFRESH_TOKEN) {
    throw new NotionApiError({
      code: 'AUTH_REQUIRED',
      action: {
        type: 'user_action',
        description: 'Reconnect your Notion account via OAuth.',
      },
      message: 'No Notion refresh token available. Reconnect required.',
    });
  }

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await fetch(NOTION_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 400 || response.status === 401) {
      throw new NotionApiError({
        code: 'AUTH_EXPIRED',
        action: {
          type: 'user_action',
          description: 'Reconnect your Notion account — refresh token rejected.',
        },
        message: `Notion token refresh failed (${response.status}): ${body}`,
      });
    }
    throw new NotionApiError({
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Notion OAuth temporarily unavailable.' },
      message: `Notion token refresh failed (${response.status}): ${body}`,
    });
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const updated: Record<string, string> = { ACCESS_TOKEN: data.access_token };
  if (data.refresh_token) updated.REFRESH_TOKEN = data.refresh_token;
  if (data.expires_in) {
    updated.EXPIRY_DATE = new Date(Date.now() + data.expires_in * 1000).toISOString();
  }
  await ctx.secrets.updateInstallation(updated);

  return data.access_token;
}

/**
 * Build a Notion SDK Client wired with a refresh-on-401 fetch hook.
 */
export async function getNotionClient(ctx: ToolContext): Promise<Client> {
  const secrets = await loadNotionSecrets(ctx);

  if (!secrets.ACCESS_TOKEN) {
    throw new NotionApiError({
      code: 'AUTH_REQUIRED',
      action: {
        type: 'user_action',
        description: 'Connect your Notion account via OAuth.',
      },
      message: 'Notion account not connected. Please connect your Notion account.',
    });
  }

  let currentToken = secrets.ACCESS_TOKEN;

  const withAuth = (init: NotionFetchInit | undefined, token: string): Headers => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return headers;
  };

  const customFetch: NotionFetch = async (url, init) => {
    const response = await fetch(url, { ...init, headers: withAuth(init, currentToken) });
    if (response.status !== 401) return response;

    // Refresh once; a second 401 means the refresh token itself is dead.
    currentToken = await refreshNotionAccessToken(ctx, secrets);
    return await fetch(url, { ...init, headers: withAuth(init, currentToken) });
  };

  return new Client({
    auth: currentToken,
    notionVersion: '2026-03-11',
    fetch: customFetch as any,
    retry: false,
  });
}

/**
 * Validate credentials by making a test API call.
 */
export async function validateCredentials(ctx: ToolContext): Promise<void> {
  const client = await getNotionClient(ctx);
  await client.users.me({});
}

/**
 * Get all blocks from a page/block recursively.
 */
export async function getAllBlocks(client: Client, blockId: string, depth = 0): Promise<any[]> {
  const maxDepth = 10;
  if (depth > maxDepth) return [];

  const blocks: any[] = [];
  let cursor: string | undefined;

  do {
    const response: any = await client.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      blocks.push(block);
      if (block.has_children) {
        const children = await getAllBlocks(client, block.id, depth + 1);
        block.children = children;
      }
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

/**
 * Format rich text array to plain text.
 */
export function formatRichText(richTextArray: any[]): string {
  if (!richTextArray || !Array.isArray(richTextArray)) return '';
  return richTextArray.map((rt: { plain_text: string }) => rt.plain_text).join('');
}

/**
 * Format blocks as readable text (markdown-like).
 */
export function formatBlocksAsText(blocks: any[], indent = 0, includeBlockIds = false): string {
  let text = '';
  const indentStr = '  '.repeat(indent);

  for (const block of blocks) {
    const type = block.type;

    if (includeBlockIds && indent === 0) {
      text += `<!-- block: ${block.id} -->\n`;
    }

    switch (type) {
      case 'paragraph':
        text += `${indentStr}${formatRichText(block.paragraph.rich_text)}\n`;
        break;
      case 'heading_1':
        text += `${indentStr}# ${formatRichText(block.heading_1.rich_text)}\n`;
        break;
      case 'heading_2':
        text += `${indentStr}## ${formatRichText(block.heading_2.rich_text)}\n`;
        break;
      case 'heading_3':
        text += `${indentStr}### ${formatRichText(block.heading_3.rich_text)}\n`;
        break;
      case 'heading_4':
        text += `${indentStr}#### ${formatRichText(block.heading_4.rich_text)}\n`;
        break;
      case 'bulleted_list_item':
        text += `${indentStr}- ${formatRichText(block.bulleted_list_item.rich_text)}\n`;
        break;
      case 'numbered_list_item':
        text += `${indentStr}1. ${formatRichText(block.numbered_list_item.rich_text)}\n`;
        break;
      case 'to_do': {
        const checked = block.to_do.checked ? 'x' : ' ';
        text += `${indentStr}[${checked}] ${formatRichText(block.to_do.rich_text)}\n`;
        break;
      }
      case 'toggle':
        text += `${indentStr}▶ ${formatRichText(block.toggle.rich_text)}\n`;
        break;
      case 'code': {
        const language = block.code.language;
        text += `${indentStr}\`\`\`${language}\n${formatRichText(block.code.rich_text)}\n${indentStr}\`\`\`\n`;
        break;
      }
      case 'quote':
        text += `${indentStr}> ${formatRichText(block.quote.rich_text)}\n`;
        break;
      case 'callout':
        text += `${indentStr}📌 ${formatRichText(block.callout.rich_text)}\n`;
        break;
      case 'divider':
        text += `${indentStr}---\n`;
        break;
      case 'meeting_notes': {
        const summary = formatRichText(block.meeting_notes?.summary ?? []);
        text += `${indentStr}🎙 Meeting notes${summary ? `: ${summary}` : ''}\n`;
        break;
      }
      default:
        text += `${indentStr}[${type}]\n`;
    }

    if (block.children && block.children.length > 0) {
      text += formatBlocksAsText(block.children, indent + 1, includeBlockIds);
    }
  }

  return text;
}
