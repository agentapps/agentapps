/**
 * Interactive stdio demo — spawns the Research Assistant as a real child
 * process and exercises it through the full protocol lifecycle.
 *
 * Usage:  pnpm --filter @agentapps/app.research dev
 *   or:  npx tsx test/demo.ts
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnvelope, type MessageBase, PROTOCOL_VERSION } from '@agentapps/protocol';
import { AppStation, LocalProcessRuntime } from '@agentapps/station';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ENTRY = join(__dirname, '..', 'src', 'main.ts');

// ---------------------------------------------------------------------------
// Pretty-print helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(msg);
}

function printResult(msg: Record<string, unknown>) {
  const m = msg as Record<string, unknown>;
  if (m.result) {
    console.log('\n  ✅ Result:');
    console.log(JSON.stringify(m.result, null, 4).replace(/^/gm, '     '));
  }
  if (m.error) {
    console.log('\n  ❌ Error:', JSON.stringify(m.error, null, 2));
  }
}

function printProgress(msg: Record<string, unknown>) {
  const progress = msg.progress as number;
  const status = msg.status as string;
  const bar = '█'.repeat(Math.round(progress / 5)) + '░'.repeat(20 - Math.round(progress / 5));
  process.stdout.write(`\r  ⏳ ${bar} ${progress}%  ${status ?? ''}`.slice(0, 80));
}

// ---------------------------------------------------------------------------
// Main demo
// ---------------------------------------------------------------------------

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('  🤖 Agent Apps — stdio child-process demo');
  log('═══════════════════════════════════════════════════════════════\n');

  // 1. AppStation with LocalProcessRuntime
  const runtime = new LocalProcessRuntime({
    entryPoint: APP_ENTRY,
    nodePath: 'tsx',
  });
  const appStation = new AppStation({
    appId: 'app.research',
    appVersion: '1.0.0',
    runtime,
  });

  // 2. Create an in-process transport pair (host ↔ app station)
  //    In a real platform, the host would connect over WebSocket/HTTP.
  const { createInProcessTransportPair } = await import('@agentapps/protocol');
  const [host, controllerSide] = createInProcessTransportPair();
  appStation.accept(controllerSide);

  // 3. Collect and pretty-print messages
  const received: MessageBase[] = [];
  host.onMessage((msg) => {
    received.push(msg);
    const m = msg as Record<string, unknown>;

    if (msg.type === 'tool_progress') {
      printProgress(m);
    } else if (msg.type === 'tool_result') {
      process.stdout.write('\n');
      printResult(m);
    } else if (msg.type === 'log') {
      console.log(`  📝 [${m.level}] ${m.message}`);
    } else if (msg.type === 'error') {
      console.log(`  ❌ Error: ${(m.error as Record<string, unknown>).message}`);
    }
  });

  const waitFor = (type: string, timeoutMs = 5000): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
      const check = setInterval(() => {
        const found = received.find((m) => m.type === type);
        if (found) {
          clearInterval(check);
          clearTimeout(timer);
          resolve(found as Record<string, unknown>);
        }
      }, 5);
    });

  // 4. Initialize
  log('▶️  Initializing...');
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'stdio-demo', version: '0.0.1' },
    capabilities: { directConnection: false },
  } as MessageBase);
  const init = await waitFor('initialized');
  log(
    `   ✅ Protocol ${init.negotiatedVersion}, app: ${(init.app as Record<string, unknown>).id}\n`,
  );

  // 5. Open session
  log('▶️  Opening session...');
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'demo_local',
    tenant: { userId: 'developer' },
  } as MessageBase);
  const opened = await waitFor('session_opened');
  const sessionId = opened.sessionId as string;
  log(`   ✅ Session: ${sessionId}\n`);

  // 6. List tools
  log('▶️  Listing tools...');
  received.length = 0;
  host.send({
    ...createEnvelope('list_tools'),
    sessionId,
  } as MessageBase);
  const toolsList = await waitFor('tools_list');
  const tools = (toolsList.tools as Array<Record<string, unknown>>).map((t) => t.name as string);
  log(`   🔧 Available: ${tools.join(', ')}\n`);

  // 7. Demo: search
  log('▶️  Calling search(query: "artificial intelligence")...');
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'search',
    arguments: { query: 'artificial intelligence', limit: 3 },
    context: { userId: 'developer', installationId: 'demo_local' },
  } as MessageBase);
  await waitFor('tool_result');
  log('');

  // 8. Demo: summarize
  log('▶️  Calling summarize(text: "The quick brown fox...")...');
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'summarize',
    arguments: {
      text: 'The quick brown fox jumps over the lazy dog. This pangram contains every letter of the English alphabet. It is commonly used for touch-typing practice and testing fonts and keyboards. The earliest known appearance is in The Boston Journal in 1885.',
      maxPoints: 3,
    },
    context: { userId: 'developer', installationId: 'demo_local' },
  } as MessageBase);
  await waitFor('tool_result');
  log('');

  // 9. Demo: save-note
  log('▶️  Calling save-note(title: "AI Research", content: "...")...');
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'save-note',
    arguments: {
      title: 'AI Research',
      content:
        '# AI Research Notes\n\n- Key finding: LLMs show emergent reasoning at scale\n- Next step: experiment with chain-of-thought prompting\n- Deadline: end of quarter',
      tags: ['ai', 'research', 'llm'],
    },
    context: { userId: 'developer', installationId: 'demo_local' },
  } as MessageBase);
  await waitFor('tool_result');
  log('');

  // 10. Demo: list-notes
  log('▶️  Calling list-notes()...');
  received.length = 0;
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool: 'list-notes',
    arguments: {},
    context: { userId: 'developer', installationId: 'demo_local' },
  } as MessageBase);
  await waitFor('tool_result');
  log('');

  // 11. Health check
  log('▶️  Calling health_check...');
  received.length = 0;
  host.send({
    ...createEnvelope('health_check'),
    sessionId,
  } as MessageBase);
  const health = await waitFor('health_status');
  log(`   💚 Status: ${health.status} — ${health.message}\n`);

  // 12. Shutdown
  log('▶️  Shutting down...');
  await appStation.shutdown();
  log('   ✅ AppStation and child process terminated.\n');

  log('═══════════════════════════════════════════════════════════════');
  log('  🎉 Demo complete!');
  log('═══════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
