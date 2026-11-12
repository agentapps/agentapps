/**
 * Standalone runner for the Google News Agent App.
 *
 * Usage: npx tsx src/main.ts [topic]
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
    appId: 'app.google-news',
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
      console.log('\n✅ Tool result:', JSON.stringify(m.result, null, 2));
    } else if (msg.type === 'log') {
      console.log(`  📝 [${m.level}] ${m.message}`);
    } else if (msg.type === 'error') {
      console.error('\n❌ Error:', (m.error as Record<string, unknown>).message);
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

  // Initialize
  console.log('🚀 Initializing app.google-news...\n');
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'dev-runner', version: '0.0.1' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitFor('initialized');

  // Open session
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'dev_local',
    tenant: { userId: 'developer' },
  } as MessageBase);
  const opened = await waitFor('session_opened');
  const sessionId = opened.sessionId as string;
  console.log(`📡 Session opened: ${sessionId}\n`);

  // List tools
  received.length = 0;
  host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
  const toolsList = await waitFor('tools_list');
  const tools = toolsList.tools as Array<Record<string, unknown>>;
  console.log(`🔧 Available tools: ${tools.map((t) => t.name).join(', ')}\n`);

  // Fetch headlines
  const topic = process.argv[2] ?? '';
  const region = process.argv[3] ?? '';
  console.log(
    `--- Fetching headlines${topic ? `: "${topic}"` : ''}${region ? ` (${region})` : ''} ---`,
  );
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'headlines',
    arguments: { topic, region, count: 5 },
    context: { userId: 'developer', installationId: 'dev_local' },
  } as MessageBase);
  const headlinesMsg = await waitFor('tool_result');
  const headlines = (headlinesMsg as Record<string, unknown>).result as Record<string, unknown>;
  const items = headlines.headlines as Array<Record<string, unknown>>;

  // Read the first article if --read flag is passed
  if (process.argv.includes('--read') && items?.length > 0) {
    const firstUrl = items[0].url as string;
    const firstTitle = items[0].title as string;
    console.log(`\n\n--- Reading article: "${firstTitle}" ---`);
    received.length = 0;
    host.send({
      ...createEnvelope('tool_call'),
      sessionId,
      tool: 'read_article',
      arguments: { url: firstUrl },
      context: { userId: 'developer', installationId: 'dev_local' },
    } as MessageBase);
    await waitFor('tool_result');
  }

  // Shutdown
  console.log('\n\n🛑 Shutting down...');
  await controller.shutdown();
  console.log('Done.\n');
}

main().catch(console.error);
