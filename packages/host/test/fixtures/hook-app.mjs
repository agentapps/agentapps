// Child-process app for HOOK-AC-28: one shaping and one notify hook.
import { StdioTransport } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';

const app = createApp({ id: 'app.hook-relay', version: '1.0.0' });
app.hook('pre-turn', ({ input }) => ({
  context: [{ label: 'Echo', text: `seen: ${input.message.text}` }],
}));
app.hook('post-turn', () => {});
await app.toFactory()(new StdioTransport());
process.stdin.on('end', () => process.exit(0));
