---
"@agentapps/protocol": minor
"@agentapps/sdk": minor
"@agentapps/host": minor
---

Add lifecycle hooks: onInstall, onUninstall, onSessionOpen, onSessionClose

Apps can now initialize state when installed in a new workspace and clean up
when uninstalled. Session-level hooks fire on session open/close, including
shutdown.

New protocol messages:
- `install` / `installed` (control plane)
- `uninstall` / `uninstalled` (control plane)
- `session_opened` / `session_closed` (session plane notifications)

New SDK API:
```ts
app
  .onInstall(async (ctx) => {
    await ctx.storage.put('settings', 'default', { theme: 'dark' });
  })
  .onUninstall(async (ctx) => {
    await ctx.log('info', 'Cleaning up');
  })
  .onSessionOpen(async (ctx) => {
    ctx.emit('session_started', { userId: ctx.execution.userId });
  })
  .onSessionClose(async (ctx) => {
    await ctx.storage.update('sessions', ctx.execution.userId, { endedAt: new Date().toISOString() });
  });
```

New types: `LifecycleContext`, `SessionContext` (extends LifecycleContext with
execution context and event emission).

New host methods: `host.install()`, `host.uninstall()`.
