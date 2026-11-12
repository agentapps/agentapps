#!/usr/bin/env node
/** Entry for the experimental `agentapps-pack` bin: always runs pack. */

import { run } from '../cli-main.js';

run(['pack', ...process.argv.slice(2)]).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
