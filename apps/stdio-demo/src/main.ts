/**
 * stdio entry point for the Research Assistant Agent App.
 *
 * Wires the app factory to a StdioTransport so the controller
 * can communicate via JSON-lines over stdin/stdout.
 *
 * Usage: node src/main.ts
 *   (stdin)  ← JSON lines from controller
 *   (stdout) → JSON lines to controller
 */

import { StdioTransport } from '@agentapps/protocol';
import { factory } from './app.js';

async function main() {
  const transport = new StdioTransport();
  await factory(transport);

  // Keep alive until stdin closes
  process.stdin.on('end', () => {
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
