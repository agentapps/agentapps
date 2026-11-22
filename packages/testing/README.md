# @agentapps/testing

> Test harness for Agent App developers: run an app in-process, assert on protocol traffic, and check it against the conformance suite.

## Installation

```bash
npm install -D @agentapps/testing vitest
```

`vitest` is a peer dependency: the conformance suite registers vitest tests.

## Usage

```ts
import { createApp } from '@agentapps/sdk';
import { createTestHarness } from '@agentapps/testing';

const app = createApp({ id: 'app.hello', version: '1.0.0', name: 'Hello' });
app.tool('greet', {
  description: 'Greets someone',
  parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  handler: async (args) => ({ greeting: `Hello, ${args.name}!` }),
});

const harness = await createTestHarness(app.toFactory());
const session = await harness.host.openSession({
  installationId: 'inst_1',
  tenant: { userId: 'u1' },
});

const tools = await session.listTools();
const result = await session.callTool(
  'greet',
  { name: 'Alice' },
  { userId: 'u1', installationId: 'inst_1' },
);
console.log(result); // { success: true, result: { greeting: 'Hello, Alice!' }, duration: … }

await harness.shutdown();
```

### Conformance suite

`runConformanceTests` takes the app's factory, not a harness, and registers its own `describe` block, so call it at the top level of a test file:

```ts
import { runConformanceTests } from '@agentapps/testing';
import { factory } from '../src/app.js';

runConformanceTests(factory);
```

It checks the handshake, `list_tools`, `health_check`, the shape of a tool call's answer, cancel, event subscription and session reuse. It never runs one of your app's tools: the tool-call check calls a tool the app does not have.

## API

- **`createTestHarness(appFactory, options?)`**: starts an app station, a host and the app in one process. Returns a `TestHarness` with `host` (already initialized), `appStation`, `traffic` (every protocol message seen, both directions) and `shutdown()`.
- **`TestHarnessOptions`**: `appId`, `appVersion`, `hostConfig` and `appStationConfig` (`openTimeoutMs`, `maxInflightPerSession`, `idleTimeoutMs`, `maxInstances`).
- **`runConformanceTests(appFactory, options?)`**: registers the conformance suite as vitest tests.
- **`waitForMessage(traffic, type, timeoutMs?)`**: resolves with the first message of that type in the traffic, or rejects after the timeout (5 s by default).
- **`mockRequest(harness, handler)`**: answers the app's requests to the host (secrets, auth) with `handler`. Returns a function that restores the original handlers.
- **`simulateDisconnect(harness)`**: drops the transport and wires a new one, to test how the app copes.
- **`toContainMessage(traffic, filter)`**: throws unless the traffic has a message that matches. The filter is a type name or `{ type, predicate }`.
- **`toHaveMessageSequence(traffic, types)`**: throws unless the traffic has those message types in that order.

## License

MIT
