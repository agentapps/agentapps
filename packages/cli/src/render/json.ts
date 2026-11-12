/**
 * @agentapps/cli — JSON renderer.
 */

import type { CommandResult, Renderer } from './types.js';

export class JsonRenderer implements Renderer {
  render(result: CommandResult): string {
    const { layout: _layout, ...rest } = result;
    return JSON.stringify(rest, null, 2);
  }
}
