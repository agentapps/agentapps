# @agentapps/host

> Host side of the Agent Apps protocol — embed in a platform to consume agent apps via their controllers.

## Installation

```bash
npm install @agentapps/host
```

## Usage

```ts
import { AgentAppHost } from '@agentapps/host';
import { HttpTransport } from '@agentapps/protocol';

const transport = new HttpTransport({ url: 'https://controller.example.com' });

const host = new AgentAppHost(transport, {
  host: { name: 'my-platform', version: '1.0.0' },
  callbacks: {
    onGetInstallationSecrets: async (sessionId) => {
      return db.getInstallationSecrets(sessionId);
    },
  },
});

const info = await host.initialize();
const session = await host.openSession({
  installationId: 'inst_1',
  tenant: { userId: 'u1' },
});

const tools = await session.listTools();
const result = await session.callTool('greet', { name: 'World' });
await session.close();
await host.shutdown();
```

```ts
// Subscribe to controller health and session status events
host.onControllerHealth((status) => {
  console.log('AppStation health:', status);
});

host.onSessionStatus((status) => {
  console.log('Session status:', status);
});
```

## API

- **`AgentAppHost`** — Main host class. Manages handshake, session lifecycle, callback dispatch, and notification routing.
- **`AgentAppHostConfig`** — Configuration: `host` (name, version), `callbacks` (secret/auth handlers), `directConnection` (reserved, default false).
- **`Session`** — Represents an open tenant session: `listTools()`, `callTool(name, args, context?)`, `close()`.
- **`InitializeResult`** — Handshake result: protocol version, controller capabilities, controller info.
- **`StationCapabilities`** — Advertised capabilities: `modes`, `directConnection`, `asyncOpen`, `push`, `extensions`.
- **`RequestHandlers`** — Host-provided callbacks: `onGetInstallationSecrets`, `onGetSystemSecrets`, `onGetAuthStatus`, `onGetAccessToken`.
- **`Tenant`** — Tenant identity: `userId`, optional `workspaceId`.

## License

MIT
