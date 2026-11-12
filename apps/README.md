# Agent Apps

This directory contains all Agent Apps — self-contained applications built with the `@agentapps/*` packages.

Each app lives in its own directory and includes:

- `agentapp.json` — app manifest (id, version, metadata, runtime, auth)
- `src/` — TypeScript source code
- `dist/` — compiled output
- `test/` — tests
- `package.json` — package metadata and dependencies
- `tsconfig.json` — TypeScript configuration

## Available apps

The catalog includes integrations for popular services (Google, Slack, Notion, GitHub, Linear, Figma, etc.), developer tools (Bash, Filesystem, Playwright, Browserbase), media generation (ElevenLabs, Replicate, Canva), and utility apps (Hello, Todo List, Compliance Filter).

To list all available apps:

```bash
agentapps apps
```

To inspect a specific app:

```bash
agentapps info app.hello
```

## Creating a new app

```bash
npm create @agentapps my-app
```

See [`@agentapps/create`](../packages/create) for templates and scaffolding options.

## License

MIT
