/**
 * @agentapps/cli — renderer factory.
 */

import { HumanRenderer } from './human.js';
import { JsonRenderer } from './json.js';
import type { Renderer, RenderOptions } from './types.js';
import { YamlRenderer } from './yaml.js';

export { HumanRenderer } from './human.js';
export { JsonRenderer } from './json.js';
export type { CommandResult, Renderer, RenderOptions, ResultValue } from './types.js';
export { YamlRenderer } from './yaml.js';

export function createRenderer(options: RenderOptions): Renderer {
  if (options.format === 'json') return new JsonRenderer();
  if (options.format === 'yaml') return new YamlRenderer();
  if (options.format === 'raw') return new JsonRenderer();
  return new HumanRenderer({
    colors: { enabled: options.isTTY && !options.noColor },
    width: options.width,
  });
}

export function detectFormat(argv: string[]): {
  format: 'human' | 'json' | 'yaml' | 'raw';
  isTTY: boolean;
  noColor: boolean;
} {
  const isTTY = process.stdout.isTTY ?? false;
  const noColor = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '';
  if (argv.includes('--json')) return { format: 'json', isTTY, noColor };
  if (argv.includes('--yaml')) return { format: 'yaml', isTTY, noColor };
  if (argv.includes('--raw')) return { format: 'raw', isTTY, noColor };
  return { format: 'human', isTTY, noColor };
}
