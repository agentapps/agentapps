/**
 * Echo fixture app for LocalProcessRuntime tests.
 *
 * Self-contained: reads JSON lines from stdin, writes JSON lines to stdout.
 * No external dependencies — works with plain node (ES module).
 */

import { createInterface } from 'node:readline';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface BaseMessage {
  id: string;
  type: string;
  timestamp: string;
  version: string;
  sessionId: string;
}

interface ListToolsMessage extends BaseMessage {
  type: 'list_tools';
}

interface ToolCallMessage extends BaseMessage {
  type: 'tool_call';
  arguments: Record<string, JsonValue>;
}

interface ShutdownMessage extends BaseMessage {
  type: 'shutdown';
}

type InboundMessage = ListToolsMessage | ToolCallMessage | ShutdownMessage;

interface OutboundMessage {
  id: string;
  type: string;
  timestamp: string;
  version: string;
  sessionId: string;
}

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line) as InboundMessage;

    if (msg.type === 'list_tools') {
      const response: OutboundMessage & {
        tools: Array<{ name: string; description: string; parameters: Record<string, JsonValue> }>;
      } = {
        id: msg.id,
        type: 'tools_list',
        timestamp: new Date().toISOString(),
        version: '2.0',
        sessionId: msg.sessionId,
        tools: [
          {
            name: 'echo',
            description: 'Echo the arguments back',
            parameters: { type: 'object', properties: {} },
          },
        ],
      };
      console.log(JSON.stringify(response));
    } else if (msg.type === 'tool_call') {
      const response: OutboundMessage & {
        success: boolean;
        result: Record<string, JsonValue>;
        duration: number;
      } = {
        id: msg.id,
        type: 'tool_result',
        timestamp: new Date().toISOString(),
        version: '2.0',
        sessionId: msg.sessionId,
        success: true,
        result: msg.arguments,
        duration: 1,
      };
      console.log(JSON.stringify(response));
    } else if (msg.type === 'shutdown') {
      rl.close();
      process.exit(0);
    }
  } catch (err) {
    console.error('Parse error:', err);
  }
});
