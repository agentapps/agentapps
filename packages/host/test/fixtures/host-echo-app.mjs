// Child-process app for HOSTCAP-AC-2: answers `host` with what ctx.host holds.
import { StdioTransport } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';

const app = createApp({ id: 'app.host-echo', version: '1.0.0' });
app.tool('host', {
  description: 'Return the Host behind the session',
  parameters: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  handler: async (_args, ctx) => ({ host: ctx.host ?? null }),
});
await app.toFactory()(new StdioTransport());
process.stdin.on('end', () => process.exit(0));
