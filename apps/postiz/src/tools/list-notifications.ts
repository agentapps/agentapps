import type { AgentApp } from '@agentapps/sdk';
import { type Args, readPage } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { MAX_RESULT_CHARS } from './list-posts.js';

interface Notification {
  id: string;
  content?: string;
  link?: string | null;
  createdAt?: string;
}

interface NotificationsAnswer {
  notifications?: Notification[];
  total?: number;
  hasMore?: boolean;
}

export function registerListNotificationsTool(app: AgentApp): void {
  /** @spec POSTIZ-REQ-13 */
  app.tool('list-notifications', {
    description:
      'List the notifications of the Postiz account (a post that failed, a channel that needs reconnecting), newest page first, 100 per page. Returns { notifications: [{ id, content, link, createdAt }], page, total, hasMore }. Pages start at 0; ask for page + 1 while hasMore is true.',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 0, description: 'Page number, from 0. Default 0.' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const page = readPage(a.page, 0);
      const answer = await apiRequest<NotificationsAnswer>('GET', '/notifications', ctx, {
        params: { page },
      });
      const all = Array.isArray(answer?.notifications) ? answer.notifications : [];
      const summary = {
        page,
        total: answer?.total ?? all.length,
        hasMore: answer?.hasMore === true,
      };
      const notifications: unknown[] = [];
      let size = 0;
      for (const notification of all) {
        const item = {
          id: notification.id,
          content: notification.content ?? '',
          link: notification.link ?? null,
          createdAt: notification.createdAt ?? null,
        };
        size += JSON.stringify(item).length + 1;
        if (size > MAX_RESULT_CHARS) {
          return {
            notifications,
            ...summary,
            limitApplied: true,
            message: `Showing ${notifications.length} of the ${all.length} notifications on this page: the rest did not fit in one result.`,
          };
        }
        notifications.push(item);
      }
      return { notifications, ...summary };
    },
  });
}
