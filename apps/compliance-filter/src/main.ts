/**
 * Compliance Filter — stdio entry point.
 *
 * Run with: npx tsx src/main.ts
 * Or via the CLI: agentapps install ./examples/compliance-filter
 */

import { StdioTransport } from '@agentapps/protocol';
import { factory } from './app.js';

const transport = new StdioTransport();
factory(transport);
