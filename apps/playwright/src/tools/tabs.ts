import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, getPage, setPage } from '../browser.js';

export function registerTabsTool(app: AgentApp): void {
  app.tool('tabs', {
    description: 'List, create, close, or select a browser tab.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'new', 'close', 'select'],
          description: 'Operation to perform',
        },
        index: {
          type: 'number',
          description:
            'Tab index, used for close/select. If omitted for close, current tab is closed.',
        },
      },
      required: ['action'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args) => {
      const { context } = await ensureBrowser();
      const currentPage = getPage();
      const pages = context.pages();

      switch (args.action) {
        case 'list':
          return pages
            .map((p, i) => `${i}: ${p.url()} ${p === currentPage ? '(active)' : ''}`)
            .join('\n');

        case 'new': {
          const newPage = await context.newPage();
          setPage(newPage);
          return `Created new tab (${pages.length} tabs total)`;
        }

        case 'close': {
          const closeIndex = (args.index as number) ?? pages.indexOf(currentPage!);
          if (closeIndex >= 0 && closeIndex < pages.length) {
            await pages[closeIndex].close();
            if (pages[closeIndex] === currentPage) {
              setPage(pages[0] || null);
            }
            return `Closed tab ${closeIndex}`;
          }
          return 'Invalid tab index';
        }

        case 'select': {
          const selectIndex = args.index as number;
          if (selectIndex >= 0 && selectIndex < pages.length) {
            const selectedPage = pages[selectIndex];
            setPage(selectedPage);
            await selectedPage.bringToFront();
            return `Selected tab ${selectIndex}: ${selectedPage.url()}`;
          }
          return 'Invalid tab index';
        }

        default:
          return 'Unknown action';
      }
    },
  });
}
