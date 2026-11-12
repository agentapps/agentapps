/**
 * Todo List Agent App — Error types
 *
 * Typed errors with code + message + suggestion so the tool layer
 * can produce actionable error messages for the LLM.
 */

export type TodoErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'NO_USER_CONTEXT'
  | 'CIRCULAR_MOVE'
  | 'STORAGE_ERROR';

export class TodoError extends Error {
  readonly code: TodoErrorCode;
  readonly suggestion?: string;

  constructor(code: TodoErrorCode, message: string, suggestion?: string) {
    super(message);
    this.name = 'TodoError';
    this.code = code;
    this.suggestion = suggestion;
  }
}

export function isTodoError(error: unknown): error is TodoError {
  return error instanceof TodoError;
}
