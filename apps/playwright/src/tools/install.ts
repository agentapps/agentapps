import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';

export function registerInstallTool(app: AgentApp): void {
  app.tool('install', {
    description:
      'Install the browser specified in the config. Call this if you get an error about the browser not being installed.',
    parameters: { type: 'object', properties: {} },
    // Runs the Playwright CLI and downloads Chromium onto the user's machine.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async () => {
      // The app runs in-process inside the host CLI, so the working directory
      // is the user's workspace — `npx playwright` would resolve against that
      // directory and miss this app's own playwright dependency. Resolve the
      // CLI entry from this module instead and run it with the current node.
      // (cli.js is not an exported subpath, so resolve via package.json.)
      const require = createRequire(import.meta.url);
      const cli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
      try {
        execFileSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
        return 'Chromium browser installed successfully';
      } catch (error) {
        throw new Error(`Failed to install browser: ${error}`);
      }
    },
  });
}
