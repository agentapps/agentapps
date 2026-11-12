#!/usr/bin/env node
/**
 * Entry for the `create` and `create-agent-app` bins: `create-agent-app <command> ...`, or
 * `create-agent-app <app-id> ...` to scaffold.
 */

import { run } from './cli-main.js';

run(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
