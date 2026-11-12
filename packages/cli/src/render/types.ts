/**
 * @agentapps/cli — renderer interface.
 */

export type ResultValue =
  | string
  | number
  | boolean
  | null
  | ResultValue[]
  | { [key: string]: ResultValue };

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: ResultValue;
  /**
   * Presentation hint for the human renderer; JSON/YAML renderers drop it.
   * With 'entries', an array-of-records `data` renders as multiline blocks
   * (first field as title, last as wrapped body, middle fields on the title
   * line) instead of a table.
   */
  layout?: 'entries';
  /**
   * Presentation hint for the human renderer: a Renderer's text or markdown
   * variant, printed instead of `data` because this Host draws no UI
   * Components (HOSTCAP-REQ-4). JSON/YAML renderers drop it and keep `data`.
   */
  variant?: string;
  error?: {
    message: string;
    suggestion?: string;
  };
}

export interface Renderer {
  render(result: CommandResult): string;
}

export interface RenderOptions {
  isTTY: boolean;
  noColor: boolean;
  format: 'human' | 'json' | 'yaml' | 'raw';
  /** Terminal width (columns) for wrapping; omit when output is not a TTY. */
  width?: number;
}
