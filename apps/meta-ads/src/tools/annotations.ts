/** Annotations shared by every read-only tool: they only GET from the Graph API. */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
  sensitive: false,
} as const;
