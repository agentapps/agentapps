import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackCall } from './utils.js';

interface CuratedTeamPreferences {
  locale: string | null;
  defaultChannels: string[];
  whoCanCreateChannels: string | null;
  whoCanArchiveChannels: string | null;
  whoCanCreateDms: string | null;
  msgEditWindowMins: number | null;
  allowMessageDeletion: boolean | null;
  allowCalls: boolean | null;
  allowHuddles: boolean | null;
  customTos: string | null;
}

export function registerGetTeamPreferencesTool(app: AgentApp): void {
  app.tool('get-team-preferences', {
    description:
      'Get workspace policy preferences (locale, default channels, who can create/archive channels, message edit window, calls/huddles enabled). Returns curated preferences. Retryable. No params.',
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
      const result = await wrapSlackCall(() => (client as any).team.preferences.list());
      if ((args as any).includeRaw) return result;
      const p = result as any;
      const curated: CuratedTeamPreferences = {
        locale: p?.locale ?? null,
        defaultChannels: Array.isArray(p?.default_channels) ? p.default_channels : [],
        whoCanCreateChannels: p?.who_can_create_channels ?? null,
        whoCanArchiveChannels: p?.who_can_archive_channels ?? null,
        whoCanCreateDms: p?.who_can_create_dms ?? null,
        msgEditWindowMins:
          typeof p?.msg_edit_window_mins === 'number' ? p.msg_edit_window_mins : null,
        allowMessageDeletion:
          typeof p?.allow_message_deletion === 'boolean' ? p.allow_message_deletion : null,
        allowCalls: typeof p?.allow_calls === 'boolean' ? p.allow_calls : null,
        allowHuddles: typeof p?.allow_huddles === 'boolean' ? p.allow_huddles : null,
        customTos: p?.custom_tos ?? null,
      };
      return curated;
    },
  });
}
