/**
 * Standalone runner for the Perplexity AI Agent App.
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
  // 1. Set up controller with the app factory
  const runtime = new InProcessRuntime(factory);
  const controller = new AppStation({
    appId: 'app.perplexity',
    appVersion: '1.0.0',
    runtime,
  });

  const [host, controllerSide] = createInProcessTransportPair();
  controller.accept(controllerSide);

  // Collect responses
  const received: MessageBase[] = [];
  host.onMessage((msg) => {
    received.push(msg);
    const m = msg as Record<string, unknown>;

    if (msg.type === 'tool_result') {
      console.log('\n✅ Tool result:', JSON.stringify(m.result, null, 2));
    } else if (msg.type === 'log') {
      console.log(`  📝 [${m.level}] ${m.message}`);
    } else if (msg.type === 'error') {
      console.error('\n❌ Error:', (m.error as Record<string, unknown>).message);
    } else if (msg.type === 'get_system_secrets') {
      // Provide the API key from env
      host.send({
        ...createEnvelope('system_secrets'),
        requestId: m.id as string,
        secrets: { APIKEY: process.env.PERPLEXITY_API_KEY ?? '' },
      } as MessageBase);
    }
  });

  // Helper to wait for a message type
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

  // 2. Initialize
  console.log('🚀 Initializing app.perplexity...\n');
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'dev-runner', version: '0.0.1' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitFor('initialized');

  // 3. Open session
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'dev_local',
    tenant: { userId: 'developer' },
  } as MessageBase);
  const opened = await waitFor('session_opened');
  const sessionId = opened.sessionId as string;
  console.log(`📡 Session opened: ${sessionId}\n`);

  // 4. List tools
  received.length = 0;
  host.send({
    ...createEnvelope('list_tools'),
    sessionId,
  } as MessageBase);
  const toolsList = await waitFor('tools_list');
  const tools = toolsList.tools as Array<Record<string, unknown>>;
  console.log(`🔧 Available tools: ${tools.map((t) => t.name).join(', ')}\n`);

  // 5. Search
  const query = process.argv[2] ?? 'What is the Agent Apps protocol?';
  console.log(`--- Searching: "${query}" ---`);
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'search',
    arguments: { query },
    context: { userId: 'developer', installationId: 'dev_local' },
  } as MessageBase);
  await waitFor('tool_result');

  // 6. Shutdown
  console.log('\n\n🛑 Shutting down...');
  await controller.shutdown();
  console.log('Done.\n');
}

main().catch(console.error);
