/**
 * Standalone runner for the Playwright Agent App.
 *
 * Usage: npx tsx src/main.ts
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { factory } from './app.js';

async function main() {
  const runtime = new InProcessRuntime(factory);
  const controller = new AppStation({
    appId: 'app.playwright',
    appVersion: '1.0.0',
    runtime,
  });

  const [host, controllerSide] = createInProcessTransportPair();
  controller.accept(controllerSide);

  const received: MessageBase[] = [];
  host.onMessage((msg) => {
    received.push(msg);
    const m = msg as Record<string, unknown>;

    if (msg.type === 'tool_result') {
      console.log('\n--- Tool result ---');
      console.log(JSON.stringify(m.result, null, 2));
    } else if (msg.type === 'log') {
      console.log(`  [${m.level}] ${m.message}`);
    } else if (msg.type === 'get_system_secrets') {
      // Playwright has no auth/secrets
      host.send({
        ...createEnvelope('system_secrets'),
        requestId: m.id as string,
        secrets: {},
      } as MessageBase);
    }
  });

  const waitFor = (
    type: string | ((m: MessageBase) => boolean),
  ): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      const check = setInterval(() => {
        const found = received.find((m) =>
          typeof type === 'function' ? type(m) : m.type === type,
        );
        if (found) {
          clearInterval(check);
          resolve(found as Record<string, unknown>);
        }
      }, 5);
    });

  console.log('Initializing app.playwright...\n');
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'dev-runner', version: '0.0.1' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitFor('initialized');

  host.send({
    ...createEnvelope('session_open'),
    installationId: 'dev_local',
    tenant: { userId: 'developer' },
  } as MessageBase);
  const opened = await waitFor('session_opened');
  const sessionId = opened.sessionId as string;
  console.log(`Session opened: ${sessionId}\n`);

  received.length = 0;
  host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
  const toolsList = await waitFor('tools_list');
  const tools = toolsList.tools as Array<Record<string, unknown>>;
  console.log(`Available tools (${tools.length}): ${tools.map((t) => t.name).join(', ')}\n`);

  // Quick test: navigate to a page
  console.log('Running: browser-navigate to https://example.com');
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'browser-navigate',
    arguments: { url: 'https://example.com' },
    context: { userId: 'developer', installationId: 'dev_local' },
  } as MessageBase);
  await waitFor((m) => m.type === 'tool_result');

  // Take a snapshot
  console.log('\nRunning: browser-snapshot');
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'browser-snapshot',
    arguments: {},
    context: { userId: 'developer', installationId: 'dev_local' },
  } as MessageBase);
  await waitFor((m) => m.type === 'tool_result');

  // Close the browser
  console.log('\nRunning: browser-close');
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'browser-close',
    arguments: {},
    context: { userId: 'developer', installationId: 'dev_local' },
  } as MessageBase);
  await waitFor((m) => m.type === 'tool_result');

  console.log('\nShutting down...');
  await controller.shutdown();
  console.log('Done.\n');
}

main().catch(console.error);
