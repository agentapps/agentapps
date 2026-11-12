import { describe, expect, it } from 'vitest';
import { ToolDefinitionSchema } from '../src/index.js';

describe('ToolDefinitionSchema', () => {
  it('parses a minimal tool definition', () => {
    const tool = {
      name: 'send-email',
      description: 'Send an email',
      parameters: {
        type: 'object' as const,
        properties: {
          to: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['to', 'body'],
      },
    };
    const parsed = ToolDefinitionSchema.parse(tool);
    expect(parsed.name).toBe('send-email');
    expect(parsed.annotations).toBeUndefined();
  });

  it('parses a tool with full annotations', () => {
    const tool = {
      name: 'list-tasks',
      description: 'List tasks',
      parameters: { type: 'object' as const, properties: {} },
      annotations: {
        version: '1.2.0',
        stability: 'stable' as const,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        irreversible: false,
      },
    };
    const parsed = ToolDefinitionSchema.parse(tool);
    expect(parsed.annotations?.readOnlyHint).toBe(true);
    expect(parsed.annotations?.irreversible).toBe(false);
  });

  it('rejects a tool with invalid stability value', () => {
    const tool = {
      name: 'test',
      description: 'test',
      parameters: { type: 'object' as const, properties: {} },
      annotations: { stability: 'beta' },
    };
    expect(ToolDefinitionSchema.safeParse(tool).success).toBe(false);
  });
});
