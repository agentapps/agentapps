# @agentapps/station

> Agent App AppStation — instance lifecycle, traffic proxy, runtime adapters, and backpressure management.

## Installation

```bash
npm install @agentapps/station
```

## Usage

```ts
import { AppStation, InProcessRuntime } from '@agentapps/station';
import type { AppFactory } from '@agentapps/station';

const appFactory: AppFactory = (transport) => {
  // Wire your app to the transport
};

const runtime = new InProcessRuntime(appFactory);

const controller = new AppStation({
  appId: 'app.hello',
  appVersion: '1.0.0',
  runtime,
  mode: 'on-demand',
  openTimeoutMs: 60_000,
  maxInflightPerSession: 32,
  idleTimeoutMs: 30 * 60 * 1000,
  maxInstances: 10,
});
```

```ts
import { AppStation, InProcessRuntime } from '@agentapps/station';

// Standalone mode — one shared instance
const controller = new AppStation({
  appId: 'app.hello',
  appVersion: '1.0.0',
  runtime: new InProcessRuntime(appFactory),
  mode: 'standalone',
});
```

## API

- **`AppStation`** — Core controller class. Manages control plane (handshake, sessions, health), session plane (proxy to instances), callbacks (secret/auth proxy with session validation), lifecycle (spawn, idle teardown, watchdog), and backpressure (max in-flight per session, max instances).
- **`AppStationConfig`** — Configuration: `appId`, `appVersion`, `runtime`, `openTimeoutMs`, `maxInflightPerSession`, `idleTimeoutMs`, `maxInstances`.
- **`InProcessRuntime`** — Runtime adapter that runs the app factory in the same process. Useful for testing and dev mode.
- **`RuntimeAdapter`** — Interface for custom runtime adapters (in-process, child process).
- **`AppFactory`** — Factory function `(transport: Transport) => void | Promise<void>` that wires an app to a transport.
- **`InstanceHandle`** — Handle to a running instance: `send(msg)`, `onMessage(handler)`, `terminate()`.
- **`SpawnConfig`** — Spawn configuration passed to the runtime adapter.

## License

MIT
