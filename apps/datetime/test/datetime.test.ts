/**
 * The datetime app through a real HookDispatcher and AppStation.
 */

import { AgentAppHost, HookDispatcher } from '@agentapps/host';
import { createInProcessTransportPair } from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, describe, expect, it } from 'vitest';
import { factory, formatNow, manifest } from '../src/app.js';

let station: AppStation | undefined;
let host: AgentAppHost | undefined;
afterEach(async () => {
  await host?.shutdown();
  await station?.shutdown();
});

describe('Date & Time', () => {
  it('formats now in the user timezone with its offset', () => {
    expect(formatNow('2026-10-08T08:42:00Z', 'Europe/Madrid', 'en-GB')).toBe(
      'Thursday, 8 October 2026 at 10:42 (Europe/Madrid, UTC+02:00)',
    );
  });

  it('[HOOK-AC-1] its pre-turn block is rendered in the turn region', async () => {
    station = new AppStation({
      appId: 'app.datetime',
      appVersion: '1.0.0',
      runtime: new InProcessRuntime(factory),
    });
    const [hostSide, stationSide] = createInProcessTransportPair();
    station.accept(stationSide);
    host = new AgentAppHost(hostSide, { host: { name: 'test', version: '1.0.0' } });
    await host.initialize();
    const session = await host.openSession({ installationId: 'inst_dt', tenant: { userId: 'u1' } });
    const dispatcher = new HookDispatcher({
      host: {
        name: 'test',
        supports: {
          transform: true,
          transformAttachments: true,
          history: true,
          preservedContext: true,
          onDream: true,
          conversationRead: true,
        },
      },
      apps: () => [
        {
          appId: 'app.datetime',
          appName: 'Date & Time',
          installationId: 'inst_dt',
          agentIds: ['agent-a'],
          hooks: manifest.hooks ?? [],
          permissions: { hooksContext: true },
          session,
        },
      ],
      log: () => {},
    });
    const outcome = await dispatcher.preTurn(
      { conversationId: 'c1', agentId: 'agent-a', userId: 'u1', timezone: 'Europe/Madrid' },
      {
        turnId: 't1',
        message: { text: 'What day is it?', attachments: [] },
        now: '2026-10-08T08:42:00Z',
      },
    );
    expect(outcome.region).toBe(
      '<app-context app="app.datetime" name="Date &amp; Time" label="Current time">\n' +
        'Thursday, 8 October 2026 at 10:42 (Europe/Madrid, UTC+02:00)\n' +
        '</app-context>',
    );
  });
});
