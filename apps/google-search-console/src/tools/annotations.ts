/**
 * Annotation sets. Declared by hand per tool kind, never inferred from tool names;
 * each tool picks one explicitly and the manifest tests check the result.
 */

/** Reads: GET requests, plus the two POST endpoints that only query data. */
export const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
  sensitive: false,
} as const;

/** Writes that set a state (PUT): repeating them changes nothing, and they can be undone. */
export const IDEMPOTENT_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
  sensitive: true,
} as const;

/** Deletes: idempotent by id, but what they remove (report history, access) is not restored. */
export const DELETE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
  sensitive: true,
} as const;
