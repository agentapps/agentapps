/**
 * Excel addressing helpers.
 *
 * Excel is addressed in three nested layers: a workbook (a drive item), a
 * worksheet inside it, and a range inside that. Each builder below composes
 * onto the previous one, and each throws a clear error rather than falling
 * back to a default — a typo'd argument name must never silently retarget.
 */

/** Normalizes a user path to Graph's form: leading slash, no trailing slash. */
export function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Percent-encodes each path segment while preserving the separators.
 * A raw `#`, `?` or `%` in a file name otherwise truncates or rewrites the URL.
 */
export function encodePathSegments(path: string): string {
  return path
    .split('/')
    .map((segment) => (segment === '' ? '' : encodeURIComponent(segment)))
    .join('/');
}

/**
 * Escapes a value for use inside an OData string literal.
 * `range(address='…')` is a function call: an apostrophe terminates the literal.
 */
export function escapeODataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/** Throws unless the name is an .xlsx workbook. */
export function assertXlsx(nameOrPath: string): void {
  if (!nameOrPath.toLowerCase().endsWith('.xlsx')) {
    throw new Error(
      `"${nameOrPath}" is not an .xlsx file. The Excel workbook API only works on .xlsx workbooks stored in OneDrive or SharePoint.`,
    );
  }
}

/**
 * Asserts a payload is a non-empty, rectangular 2-D grid.
 *
 * Graph requires this shape for every values/formulas body; catching it here
 * turns an opaque Graph 400 into an actionable message. `example` tailors the
 * sample to the calling tool — the checks themselves are identical.
 */
export function assertGrid(
  values: unknown,
  example = '[["a","b"],["c","d"]]',
): asserts values is unknown[][] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`values must be a non-empty array of rows, e.g. ${example}.`);
  }
  if (!values.every((row) => Array.isArray(row))) {
    throw new Error(
      `values must be an array of rows — each entry is itself an array of cells, e.g. ${example}.`,
    );
  }
  const width = (values[0] as unknown[]).length;
  if (!values.every((row) => (row as unknown[]).length === width)) {
    throw new Error('Every row in values must have the same number of cells.');
  }
}

/**
 * Resolves the workbook's drive item, without the /workbook suffix.
 * Throws when neither itemId nor path is supplied — there is no sensible default.
 */
export function workbookItemRef(a: Record<string, unknown>): string {
  const itemId = a.itemId as string | undefined;
  const path = a.path as string | undefined;

  if (itemId) return `/me/drive/items/${encodeURIComponent(itemId)}`;

  if (path) {
    const normalized = normalizePath(path);
    if (normalized === '') {
      throw new Error('Specify a workbook path, for example "Budgets/2026.xlsx".');
    }
    assertXlsx(normalized);
    return `/me/drive/root:${encodePathSegments(normalized)}:`;
  }

  throw new Error('Specify itemId or path to identify the workbook.');
}

/** The workbook API root for a given workbook. */
export function workbookRef(a: Record<string, unknown>): string {
  return `${workbookItemRef(a)}/workbook`;
}

/** A worksheet inside the workbook, addressed by name or id. */
export function worksheetRef(a: Record<string, unknown>): string {
  const worksheet = a.worksheet as string | undefined;
  if (!worksheet) {
    throw new Error('Specify worksheet — its name (e.g. "Sheet1") or its id.');
  }
  return `${workbookRef(a)}/worksheets/${encodeURIComponent(worksheet)}`;
}

/** A range inside a worksheet, addressed in A1 notation. */
export function rangeRef(a: Record<string, unknown>): string {
  const address = a.address as string | undefined;
  if (!address) {
    throw new Error('Specify address in A1 notation, for example "A1:C10".');
  }
  const literal = encodeURIComponent(escapeODataLiteral(address));
  return `${worksheetRef(a)}/range(address='${literal}')`;
}

/**
 * Strips a single trailing `:` from a path-form item ref.
 *
 * `workbookItemRef`'s path form (`/me/drive/root:/Finance/Budget.xlsx:`) is
 * correct when a child segment follows (`:/workbook`, `:/content`) — the
 * colon is Graph's path-vs-id delimiter. But when that ref is itself the
 * final resource in the URL (e.g. followed only by a `?$select=` query
 * string), the trailing colon must not appear: use this for that case only.
 * Do not use this on the itemId form — it has no trailing colon to strip.
 */
export function terminalRef(ref: string): string {
  return ref.endsWith(':') ? ref.slice(0, -1) : ref;
}

/** The canonical shape returned for a worksheet. */
export function formatWorksheet(ws: any): Record<string, unknown> {
  return {
    id: ws.id,
    name: ws.name,
    position: ws.position,
    visibility: ws.visibility,
  };
}

/** The canonical shape returned for a table. */
export function formatTable(t: any): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    showHeaders: t.showHeaders,
    showTotals: t.showTotals,
    style: t.style,
  };
}
