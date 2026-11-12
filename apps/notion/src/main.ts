import { StdioTransport } from '@agentapps/protocol';
import { factory } from './app.js';

const transport = new StdioTransport();
await factory(transport);
