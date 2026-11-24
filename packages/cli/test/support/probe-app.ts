/**
 * A small App written to disk for tests that run the real command: its tools
 * tell which process and which Instance answered.
 *
 * It is written under `packages/cli/.gen/` (ignored by git) so that its
 * import of `@agentapps/sdk` resolves from this package.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GEN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.gen');

export const PROBE_APP = 'app.probe';

const MODULE = `import { createApp } from '@agentapps/sdk';

const startedAt = new Date().toISOString() + '#' + Math.random().toString(16).slice(2);
const noArgs = { type: 'object', properties: {} };
const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  sensitive: false,
};

const app = createApp({ id: '${PROBE_APP}', version: '1.0.0', name: 'Probe' });
app.tool('where', {
  description: 'Answers which process and which Instance is running this tool',
  parameters: noArgs,
  annotations: readOnly,
  handler: async () => ({ pid: process.pid, startedAt }),
});
app.tool('wipe', {
  description: 'A destructive tool: it asks under the default Policy',
  parameters: noArgs,
  annotations: { ...readOnly, readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async () => ({ wiped: true }),
});
export const factory = app.toFactory();
`;

/** Write the probe App and answer its directory and how to remove it. */
export function writeProbeApp(): { source: string; remove: () => void } {
  mkdirSync(GEN, { recursive: true });
  const root = mkdtempSync(join(GEN, 'probe-'));
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(
    join(root, 'agentapp.json'),
    JSON.stringify({ id: PROBE_APP, version: '1.0.0', name: 'Probe' }),
  );
  writeFileSync(join(root, 'dist', 'app.js'), MODULE);
  return { source: root, remove: () => rmSync(root, { recursive: true, force: true }) };
}
