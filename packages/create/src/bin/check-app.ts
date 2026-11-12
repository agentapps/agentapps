#!/usr/bin/env node
/** Entry for the `agentapps-check-app` and `agentapps-validate` bins: always runs check-app. */

import { run } from '../cli-main.js';

run(['check-app', ...process.argv.slice(2)]).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
