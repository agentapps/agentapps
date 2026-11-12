/**
 * Shared Drive (formerly Team Drive) support for the Google Drive API v3.
 *
 * The Drive API treats shared drives as opt-in: every files.{get,list,create,
 * update,copy,delete} and permissions.* request MUST carry `supportsAllDrives=true`,
 * or the API returns `404 File not found` for any item that lives in a shared drive.
 *
 * `supportsAllDrives` is still REQUIRED as of 2026.
 */

/**
 * Spread into every `files.{get,create,update,copy,delete}` and `permissions.*` call.
 */
export const ALL_DRIVES = { supportsAllDrives: true } as const;

/**
 * Spread into `files.list` to include My Drive + all shared drives the user can access.
 */
export const ALL_DRIVES_LIST = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  corpora: 'allDrives',
} as const;
