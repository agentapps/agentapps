# @agentapps/sdk

> Agent Apps SDK — author apps with tools, lifecycle hooks, health checks, events, and UI resources.

## Installation

```bash
npm install @agentapps/sdk
```

## Usage

```ts
import { createApp } from '@agentapps/sdk';

const app = createApp({ id: 'app.hello', version: '1.0.0' });

app.tool('greet', {
  description: 'Greets someone by name',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Name to greet' } },
    required: ['name'],
  },
  handler: async (args) => ({ greeting: `Hello, ${args.name}!` }),
});

app.health(async (ctx) => {
  const secrets = await ctx.secrets.getSystem();
  return secrets ? { status: 'ready' } : { status: 'not_ready', message: 'Missing API key' };
});

export default app.toFactory();
```

```ts
import { createApp } from '@agentapps/sdk';

const app = createApp({ id: 'app.search', version: '1.0.0' });

app.tool('search', {
  description: 'Search documents by query',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number', default: 10 },
    },
    required: ['query'],
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async (args, ctx) => {
    const apiKey = await ctx.secrets.getSystem('SEARCH_API_KEY');
    // ... perform search
    return { results: [] };
  },
});

export default app.toFactory();
```

## API

- **`createApp(config)`** — Create an `AgentApp` builder with `id`, `version`, and optional metadata.
- **`app.tool(name, config)`** — Register a tool with `description`, `parameters` (JSON Schema), optional `annotations`, and `handler`.
- **`app.health(handler)`** — Register a health check handler. Receives `ToolContext` with `secrets` and `auth` accessors.
- **`app.toFactory()`** — Produce an `AppFactory` function that the controller can spawn.
- **`ToolContext`** — Context passed to handlers: `secrets.getSystem(key?)`, `secrets.getUser(key?)`, `auth.getStatus()`, `auth.getAccessToken()`.
- **`ToolAnnotations`** — MCP-aligned hints: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, plus platform fields: `version`, `stability`, `deprecationMessage`, `irreversible`.

## License

MIT
