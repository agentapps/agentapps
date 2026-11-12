/**
 * Helpers for building Google Drive API v3 search queries safely.
 *
 * Drive's query language embeds literal values inside single quotes. A value
 * that itself contains a single quote or backslash must be escaped.
 */
export function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Builds the `q` string for `list-files`, escaping every literal value.
 * The optional `driveQuery` is a raw Drive-syntax clause supplied by the
 * caller and is appended verbatim (parenthesised).
 */
export function buildListQuery(opts: {
  folderId?: string;
  query?: string;
  mimeType?: string;
  driveQuery?: string;
}): string {
  let q = 'trashed=false';
  if (opts.folderId) {
    q += ` and '${escapeQueryValue(opts.folderId)}' in parents`;
  }
  if (opts.query) {
    q += ` and name contains '${escapeQueryValue(opts.query)}'`;
  }
  if (opts.mimeType) {
    q += ` and mimeType='${escapeQueryValue(opts.mimeType)}'`;
  }
  if (opts.driveQuery) {
    q += ` and (${opts.driveQuery})`;
  }
  return q;
}
