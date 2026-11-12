# @agentapps/testing

> Test harness for Agent App developers — in-process testing, conformance suite, and traffic assertions.

## Installation

```bash
npm install @agentapps/testing
```

## Usage

```ts
import { createTestHarness } from '@agentapps/testing';
import { createApp } from '@agentapps/sdk';

const app = createApp({ id: 'app.hello', version: '1.0.0' });
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
const result = await session.callTool('greet', { name: 'Alice' });
console.log(result); // { greeting: 'Hello, Alice!' }

await harness.shutdown();
```

```ts
import { createTestHarness, runConformanceTests } from '@agentapps/testing';

const harness = await createTestHarness(app.toFactory());
await runConformanceTests(harness);
await harness.shutdown();
```

## API

- **`createTestHarness(appFactory, options?)`** — Spin up controller + host + app in one call. Returns a `TestHarness` with `host`, `controller`, `traffic`, and `shutdown()`.
- **`TestHarnessOptions`** — Optional overrides: `appId`, `appVersion`, `hostConfig`, `appStationConfig` (mode, timeouts, limits).
- **`runConformanceTests(harness)`** — Run the pre-built AC-8 conformance suite against a harness.
- **`waitForMessage(traffic, predicate, timeout?)`** — Wait for a message matching a predicate in the traffic log.
- **`mockRequest(handler)`** — Create a mock callback handler for testing secret/auth flows.
- **`simulateDisconnect(transport)`** — Simulate a transport disconnect for resilience testing.
- **`toContainMessage(traffic, type)`** — Custom assertion: check if traffic contains a message of a given type.
- **`toHaveMessageSequence(traffic, types)`** — Custom assertion: check if traffic contains a sequence of message types in order.

## License

MIT
