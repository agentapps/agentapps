/**
 * Standalone runner for the Hello Agent App.
 *
 * Spins up a controller with InProcessRuntime so you can play with
 * the app locally. In production, the host (Claude, etc.)
 * provides the transport — this file is just for development.
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
    appId: 'app.hello',
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

    // Print meaningful messages (skip internal protocol noise)
    if (msg.type === 'tool_result') {
      console.log('\n✅ Tool result:', JSON.stringify(m.result, null, 2));
    } else if (msg.type === 'tool_progress') {
      process.stdout.write(`\r  ⏳ ${m.status} (${m.progress}%)`);
    } else if (msg.type === 'tool_stream') {
      process.stdout.write(m.chunk as string);
    } else if (msg.type === 'log') {
      console.log(`  📝 [${m.level}] ${m.message}`);
    } else if (msg.type === 'error') {
      console.error('\n❌ Error:', (m.error as Record<string, unknown>).message);
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
  console.log('🚀 Initializing app.hello...\n');
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

  // 5. Call greet tool
  console.log("--- Calling greet(name: 'World') ---");
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'greet',
    arguments: { name: 'World' },
    context: { userId: 'developer', installationId: 'dev_local' },
  } as MessageBase);
  await waitFor('tool_result');

  // 6. Call greet in Spanish
  console.log("\n--- Calling greet(name: 'Mundo', language: 'es') ---");
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'greet',
    arguments: { name: 'Mundo', language: 'es' },
    context: { userId: 'developer', installationId: 'dev_local' },
  } as MessageBase);
  await waitFor('tool_result');

  // 7. Call countdown
  console.log('\n--- Calling countdown(from: 5, delayMs: 200) ---\n');
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'countdown',
    arguments: { from: 5, delayMs: 200 },
    context: { userId: 'developer', installationId: 'dev_local' },
  } as MessageBase);
  await waitFor('tool_result');

  // 8. Shutdown
  console.log('\n\n🛑 Shutting down...');
  await controller.shutdown();
  console.log('Done.\n');
}

main().catch(console.error);
