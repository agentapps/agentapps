/**
 * Manifest Permissions enforced by name in the AppStation
 * (docs/specs/policies.md, POLICY-REQ-8).
 */

import { createInProcessTransportPair, type EffectivePermissions } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentAppHost } from '../src/index.js';

let station: AppStation | undefined;
let host: AgentAppHost | undefined;
afterEach(async () => {
  await host?.shutdown();
  await station?.shutdown();
  vi.restoreAllMocks();
});

async function open(permissions: EffectivePermissions['permissions']) {
  const app = createApp({ id: 'app.probe', version: '1.0.0' });
  app.tool('notify', {
    description: 'Call another app',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => ctx.intent('messenger', 'send', {}),
  });
  app.tool('whoami', {
    description: 'Read the user profile',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => ({ profile: await ctx.user.get() }),
  });
  station = new AppStation({
    appId: 'app.probe',
    appVersion: '1.0.0',
    runtime: new InProcessRuntime(app.toFactory()),
  });
  const [hostSide, stationSide] = createInProcessTransportPair();
  station.accept(stationSide);
  const intentCalls: string[] = [];
  host = new AgentAppHost(hostSide, {
    host: { name: 'test', version: '1.0.0' },
    capabilities: { intents: true, profile: true },
    requests: {
      onIntentCall: async (_s, _r, binding) => {
        intentCalls.push(binding);
        return { success: true, result: { ok: true }, duration: 1 };
      },
      onGetUserProfile: async () => ({
        userId: 'u1',
        displayName: 'Ana',
        email: 'ana@hexagon.sh',
        avatarUrl: 'https://x/a.png',
      }),
    },
  });
  await host.initialize();
  const session = await host.openSession({
    installationId: 'inst_probe',
    tenant: { userId: 'u1' },
    effectivePermissions: { permissions },
  });
  const call = (tool: string) =>
    session.callTool(tool, {}, { userId: 'u1', installationId: 'inst_probe' });
  return { call, intentCalls };
}

describe('Manifest Permissions by name', () => {
  it('[POLICY-AC-8] without intents, intent_call is denied and never reaches the Host', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { call, intentCalls } = await open({});
    const result = await call('notify');
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('intents');
    expect(intentCalls).toEqual([]);

    await host?.shutdown();
    await station?.shutdown();
    const granted = await open({ intents: true });
    expect((await granted.call('notify')).success).toBe(true);
    expect(granted.intentCalls).toEqual(['messenger']);
  });

  it('[POLICY-AC-8] profile basic carries no email or avatar; full carries both; none is denied', async () => {
    const basic = await open({ profile: 'basic' });
    const b = (await basic.call('whoami')).result as { profile: Record<string, unknown> };
    expect(b.profile).toEqual({ userId: 'u1', displayName: 'Ana' });

    await host?.shutdown();
    await station?.shutdown();
    const full = await open({ profile: 'full' });
    const f = (await full.call('whoami')).result as { profile: Record<string, unknown> };
    expect(f.profile.email).toBe('ana@hexagon.sh');

    await host?.shutdown();
    await station?.shutdown();
    const none = await open({});
    const n = await none.call('whoami');
    expect(n.success).toBe(false);
    expect(JSON.stringify(n.error)).toContain('profile Permission');
  });
});
