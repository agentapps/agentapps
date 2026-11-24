/**
 * Git CLI helper shared by all `git-*` tools.
 *
 * Wraps `git -C <repoPath> <args...>` with:
 *  - path traversal protection
 *  - argv-form execution (no shell interpolation)
 *  - structured `GitResult { stdout, stderr, code }`
 *  - token sanitisation on output
 *  - parsers for structured output formats
 */

import { type SpawnSyncOptions, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ResolveRepoPathArgs {
  repoPath?: string;
  owner?: string;
  repo?: string;
}

export class GitPathError extends Error {
  readonly code = 'GIT_INVALID_PATH' as const;
}

/**
 * Resolve the workspace root for this process.
 */
export function getWorkspacePath(): string {
  const fromEnv = process.env.MCA_WORKSPACE_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (existsSync('/workspace')) return '/workspace';
  return process.cwd();
}

/**
 * Resolve the absolute repo path from agent-provided arguments.
 * Throws `GitPathError` when the resolved path escapes the workspace root.
 */
export function resolveRepoPath(args: ResolveRepoPathArgs): string {
  const workspace = getWorkspacePath();
  let target: string;

  if (args.repoPath) {
    target = isAbsolute(args.repoPath) ? args.repoPath : resolve(workspace, args.repoPath);
  } else if (args.repo) {
    target = resolve(workspace, args.repo);
  } else {
    throw new GitPathError(
      'Either `repoPath` (absolute path to a cloned repo) or `repo` (name; resolved against the workspace) must be provided.',
    );
  }

  const normalized = resolve(target);
  const workspaceNorm = resolve(workspace);

  if (normalized !== workspaceNorm && !normalized.startsWith(workspaceNorm + sep)) {
    throw new GitPathError(
      `Resolved repo path is outside the workspace (${workspaceNorm}): ${normalized}`,
    );
  }

  return normalized;
}

/**
 * Verify that `repoPath` is a git repository.
 */
/**
 * A value the caller chose and that git receives as a positional argument: a ref, a remote,
 * a tag name. One that starts with `-` would be read by git as an option (`--upload-pack=…`,
 * `--output=…`), so it is refused.
 */
export function positional(value: string, name: string): string {
  if (typeof value !== 'string' || value.startsWith('-')) {
    throw new Error(`[GIT_INVALID_INPUT] \`${name}\` cannot start with "-".`);
  }
  return value;
}

/** A path the caller chose, resolved, that must stay inside the repository. */
export function insideRepo(repoPath: string, path: string, name: string): string {
  const abs = resolve(repoPath, path);
  const rel = relative(repoPath, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`[GIT_INVALID_INPUT] \`${name}\` must be a path inside the repository.`);
  }
  return abs;
}

export function assertIsRepo(repoPath: string): void {
  const gitDir = resolve(repoPath, '.git');
  if (!existsSync(gitDir)) {
    throw new GitPathError(`Not a git repository: ${repoPath} (missing .git/)`);
  }
  const stat = statSync(gitDir);
  if (!stat.isDirectory() && !stat.isFile()) {
    throw new GitPathError(`Invalid .git entry at ${gitDir} (expected directory or file)`);
  }
}

/**
 * Sanitise stdout/stderr to redact accidental token leaks.
 */
function sanitiseTokens(text: string): string {
  if (!text) return text;
  return text
    .replace(/gh[souprt]_[A-Za-z0-9]{16,255}/g, '<REDACTED_GH_TOKEN>')
    .replace(/github_pat_[A-Za-z0-9_]{20,255}/g, '<REDACTED_GH_PAT>')
    .replace(/\bIv[12][0-9]?\.[A-Za-z0-9_-]{10,80}/g, '<REDACTED_GH_CLIENT_ID>')
    .replace(/x-access-token:[^@\s]+@/g, 'x-access-token:<REDACTED>@');
}

/**
 * Run `git -C <repoPath> <args...>` synchronously.
 */
export function runGit(repoPath: string, args: string[], opts: SpawnSyncOptions = {}): GitResult {
  const env = {
    ...process.env,
    LC_ALL: 'C',
    LANG: 'C',
    LANGUAGE: 'C',
    ...(opts.env ?? {}),
  };

  const result = spawnSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf-8',
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
    ...opts,
    env,
  });

  return {
    stdout: sanitiseTokens(String(result.stdout ?? '')),
    stderr: sanitiseTokens(String(result.stderr ?? '')),
    code: result.status ?? -1,
  };
}

// =============================================================================
// PARSERS
// =============================================================================

export interface GitStatusEntry {
  path: string;
  staged: string;
  worktree: string;
  origPath?: string;
}

export interface GitStatusResult {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
  staged: GitStatusEntry[];
  modified: GitStatusEntry[];
  untracked: GitStatusEntry[];
  conflicted: GitStatusEntry[];
  totalChanges: number;
}

/**
 * Parse `git status --porcelain=v2 --branch` output.
 */
export function parseGitStatusPorcelain(output: string): GitStatusResult {
  const result: GitStatusResult = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
    staged: [],
    modified: [],
    untracked: [],
    conflicted: [],
    totalChanges: 0,
  };

  for (const rawLine of output.split('\n')) {
    if (!rawLine) continue;
    const line = rawLine.trimEnd();

    if (line.startsWith('# branch.head')) {
      const head = line.slice('# branch.head '.length);
      if (head === '(detached)') result.detached = true;
      else result.branch = head;
      continue;
    }
    if (line.startsWith('# branch.upstream')) {
      result.upstream = line.slice('# branch.upstream '.length);
      continue;
    }
    if (line.startsWith('# branch.ab')) {
      const match = line.match(/\+(\d+)\s+-(\d+)/);
      if (match) {
        result.ahead = Number.parseInt(match[1], 10);
        result.behind = Number.parseInt(match[2], 10);
      }
      continue;
    }
    if (line.startsWith('# ')) continue;

    if (line.startsWith('1 ')) {
      const parts = line.split(' ');
      const xy = parts[1];
      const path = parts.slice(8).join(' ');
      const entry: GitStatusEntry = { path, staged: xy[0], worktree: xy[1] };
      if (entry.staged !== '.') result.staged.push(entry);
      if (entry.worktree !== '.') result.modified.push(entry);
      result.totalChanges++;
      continue;
    }
    if (line.startsWith('2 ')) {
      const parts = line.split(' ');
      const xy = parts[1];
      const lastTok = parts.slice(9).join(' ');
      const [path, origPath] = lastTok.split('\t');
      const entry: GitStatusEntry = { path, origPath, staged: xy[0], worktree: xy[1] };
      if (entry.staged !== '.') result.staged.push(entry);
      if (entry.worktree !== '.') result.modified.push(entry);
      result.totalChanges++;
      continue;
    }
    if (line.startsWith('u ')) {
      const parts = line.split(' ');
      const xy = parts[1];
      const path = parts.slice(10).join(' ');
      result.conflicted.push({ path, staged: xy[0], worktree: xy[1] });
      result.totalChanges++;
      continue;
    }
    if (line.startsWith('? ')) {
      const path = line.slice(2);
      result.untracked.push({ path, staged: '?', worktree: '?' });
      result.totalChanges++;
    }
  }

  return result;
}

export interface GitLogEntry {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  date: string;
  subject: string;
  body?: string;
}

export const LOG_PRETTY_FORMAT = '%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e';

export function parseGitLogPretty(output: string): GitLogEntry[] {
  if (!output) return [];
  return output
    .split('\x1e')
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [sha, shortSha, author, authorEmail, date, subject, body] = rec.split('\x1f');
      const entry: GitLogEntry = { sha, shortSha, author, authorEmail, date, subject };
      if (body?.trim()) entry.body = body.trim();
      return entry;
    });
}

export interface GitDiffStat {
  path: string;
  additions: number;
  deletions: number;
  origPath?: string;
}

/**
 * Parse `git diff --numstat` output.
 */
export function parseGitDiffNumstat(output: string): GitDiffStat[] {
  return output
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [add, del, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t');
      const stat: GitDiffStat = {
        path,
        additions: add === '-' ? 0 : Number.parseInt(add, 10) || 0,
        deletions: del === '-' ? 0 : Number.parseInt(del, 10) || 0,
      };
      const renameMatch = path.match(/(.*)\{(.+) => (.+)\}(.*)/);
      if (renameMatch) {
        const [, prefix, oldName, newName, suffix] = renameMatch;
        stat.origPath = `${prefix}${oldName}${suffix}`;
        stat.path = `${prefix}${newName}${suffix}`;
      }
      return stat;
    });
}
