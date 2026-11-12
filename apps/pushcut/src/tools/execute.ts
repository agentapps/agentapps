/**
 * execute — run a Shortcut or HomeKit scene on the Automation Server.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, pushcutRequest, resolveApiKey } from '../types.js';

export function registerExecuteTool(app: AgentApp): void {
  app.tool('execute', {
    description:
      'Execute a Shortcut or HomeKit scene on your iOS Automation Server via Pushcut. ' +
      'Provide either a shortcut name or a homekit scene name (not both). ' +
      'Optionally pass an input string to the shortcut.',
    parameters: {
      type: 'object',
      properties: {
        shortcut: {
          type: 'string',
          description: 'Name of the Shortcut to execute.',
        },
        homekit: {
          type: 'string',
          description: 'Name of the HomeKit scene to activate.',
        },
        input: {
          type: 'string',
          description: 'Input value passed to the shortcut.',
        },
      },
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const apiKey = await resolveApiKey(ctx);

      const shortcut = args.shortcut as string | undefined;
      const homekit = args.homekit as string | undefined;

      if (!shortcut && !homekit) {
        throw new Error('Provide either a shortcut or homekit scene name.');
      }

      const label = shortcut ? `shortcut: ${shortcut}` : `homekit: ${homekit}`;
      ctx.log('info', `Executing ${label}`);

      const body: Record<string, unknown> = {};
      if (shortcut) body.shortcut = shortcut;
      if (homekit) body.homekit = homekit;
      if (args.input) body.input = args.input;

      const response = await pushcutRequest('/execute', apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await assertOk(response);

      return { executed: true, ...(shortcut ? { shortcut } : { homekit }) };
    },
  });
}
