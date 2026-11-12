/**
 * Standalone runner for the Filesystem Agent App.
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
    appId: 'app.filesystem',
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
      host.send({
        ...createEnvelope('system_secrets'),
        requestId: m.id as string,
        secrets: {},
      } as MessageBase);
    }
  });

  const waitFor = (type: string): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      const check = setInterval(() => {
        const found = received.find((m) => m.type === type);
        if (found) {
          clearInterval(check);
          resolve(found as Record<string, unknown>);
        }
      }, 5);
    });

  console.log('Initializing app.filesystem...\n');
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

  console.log('\nShutting down...');
  await controller.shutdown();
  console.log('Done.\n');
}

main().catch(console.error);
