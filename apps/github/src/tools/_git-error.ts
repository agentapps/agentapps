import type { GitResult } from '../lib/git-local.js';

export type GitIssueCode =
  | 'GIT_NOT_A_REPO'
  | 'GIT_INVALID_PATH'
  | 'GIT_CONFLICT'
  | 'GIT_NO_CHANGES'
  | 'GIT_AUTH_FAILED'
  | 'GIT_BRANCH_EXISTS'
  | 'GIT_BRANCH_NOT_FOUND'
  | 'GIT_REF_NOT_FOUND'
  | 'GIT_DIRTY_TREE'
  | 'GIT_PUSH_REJECTED'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_NETWORK_ERROR'
  | 'GIT_TIMEOUT'
  | 'GIT_LOCKED'
  | 'GIT_NOT_INSTALLED'
  | 'GIT_UNKNOWN';

export interface GitIssueAction {
  type: 'user_action' | 'system_action';
  description: string;
  url?: string;
}

export interface ClassifiedGitError {
  code: GitIssueCode;
  message: string;
  action: GitIssueAction;
  exitCode: number;
  stderr?: string;
}

/**
 * Classify a non-zero `GitResult` into a structured error.
 */
export function classifyGitError(result: GitResult): ClassifiedGitError {
  const stderr = result.stderr || '';
  const stdout = result.stdout || '';
  const lower = `${stderr}\n${stdout}`.toLowerCase();
  const exitCode = result.code;

  if (result.code === -1) {
    if (/etimedout|enoent.*git/.test(lower) || /command failed/.test(lower)) {
      return {
        code: 'GIT_NOT_INSTALLED',
        message: 'git binary not found or not executable.',
        action: { type: 'system_action', description: 'Verify git is installed and on PATH.' },
        exitCode,
        stderr,
      };
    }
    return {
      code: 'GIT_TIMEOUT',
      message: 'git command exceeded the timeout or did not complete.',
      action: {
        type: 'user_action',
        description: 'Retry; if it persists check container resources.',
      },
      exitCode,
      stderr,
    };
  }

  if (/not a git repository/.test(lower)) {
    return {
      code: 'GIT_NOT_A_REPO',
      message: 'The path is not a git repository.',
      action: {
        type: 'user_action',
        description: 'Run `clone-repo` first or check the `repoPath` argument.',
      },
      exitCode,
      stderr,
    };
  }

  if (/(merge|rebase|cherry-pick) conflict|conflict.*in [^:]+:|fix conflicts/.test(lower)) {
    return {
      code: 'GIT_CONFLICT',
      message: 'Merge/rebase has unresolved conflicts.',
      action: {
        type: 'user_action',
        description:
          'Inspect conflicted files with `git-status`, resolve them, then `git-add` + `git-commit`.',
      },
      exitCode,
      stderr,
    };
  }

  if (
    /nothing to commit|no changes added|nothing added to commit/.test(lower) ||
    (exitCode === 1 && /working tree clean/.test(lower))
  ) {
    return {
      code: 'GIT_NO_CHANGES',
      message: 'No changes to commit.',
      action: {
        type: 'user_action',
        description: 'Stage changes with `git-add` first, or skip the commit.',
      },
      exitCode,
      stderr,
    };
  }

  if (/authentication failed|invalid credentials|permission denied \(publickey/.test(lower)) {
    return {
      code: 'GIT_AUTH_FAILED',
      message: 'Authentication with the remote failed.',
      action: {
        type: 'user_action',
        description: 'Reconnect GitHub — the user access token may have expired or been revoked.',
      },
      exitCode,
      stderr,
    };
  }

  if (/a branch named.*already exists|branch.*already exists/.test(lower)) {
    return {
      code: 'GIT_BRANCH_EXISTS',
      message: 'A branch with that name already exists.',
      action: {
        type: 'user_action',
        description:
          'Use `git-checkout` to switch to the existing branch, or pick a different name.',
      },
      exitCode,
      stderr,
    };
  }

  if (/pathspec.*did not match|invalid reference|did not match any file/.test(lower)) {
    return {
      code: 'GIT_REF_NOT_FOUND',
      message: 'Branch, tag, or commit not found.',
      action: {
        type: 'user_action',
        description: 'List branches with `git-checkout --list` or commits with `git-log`.',
      },
      exitCode,
      stderr,
    };
  }

  if (/branch.*not found|did not match any.*ref/.test(lower)) {
    return {
      code: 'GIT_BRANCH_NOT_FOUND',
      message: 'Branch not found.',
      action: { type: 'user_action', description: 'List local branches first.' },
      exitCode,
      stderr,
    };
  }

  if (
    /your local changes.*would be overwritten|cannot.*with unstaged|please commit your changes or stash/.test(
      lower,
    )
  ) {
    return {
      code: 'GIT_DIRTY_TREE',
      message: 'Working tree has uncommitted changes that would be lost.',
      action: {
        type: 'user_action',
        description: 'Commit or stash changes (`git-stash`) before this operation.',
      },
      exitCode,
      stderr,
    };
  }

  if (/rejected.*non-fast-forward|updates were rejected|hint: updates were rejected/.test(lower)) {
    return {
      code: 'GIT_PUSH_REJECTED',
      message: 'Push rejected: remote has commits not present locally (non-fast-forward).',
      action: {
        type: 'user_action',
        description: 'Pull with rebase (`git-pull`) and retry, or use `force: true`.',
      },
      exitCode,
      stderr,
    };
  }

  if (/head is detached|detached head/.test(lower)) {
    return {
      code: 'GIT_DETACHED_HEAD',
      message: 'HEAD is detached — operations are not on any branch.',
      action: {
        type: 'user_action',
        description: 'Create or check out a branch before committing.',
      },
      exitCode,
      stderr,
    };
  }

  if (
    /could not resolve host|unable to access|network is unreachable|connection (timed out|refused)/.test(
      lower,
    )
  ) {
    return {
      code: 'GIT_NETWORK_ERROR',
      message: 'Could not reach the remote.',
      action: { type: 'user_action', description: 'Check network and retry.' },
      exitCode,
      stderr,
    };
  }

  if (/index\.lock|unable to lock|another git process/.test(lower)) {
    return {
      code: 'GIT_LOCKED',
      message: 'Another git process is holding the repository lock.',
      action: {
        type: 'user_action',
        description: 'Wait a moment and retry. If it persists, remove `.git/index.lock` manually.',
      },
      exitCode,
      stderr,
    };
  }

  return {
    code: 'GIT_UNKNOWN',
    message: stderr.split('\n')[0]?.slice(0, 200) || `git exited with code ${exitCode}`,
    action: {
      type: 'user_action',
      description: 'Unexpected git error. Retry; if it persists, inspect the stderr.',
    },
    exitCode,
    stderr,
  };
}

/**
 * Throw a classified error.
 */
export function throwClassifiedGitError(result: GitResult): never {
  const classified = classifyGitError(result);
  const err = new Error(`[${classified.code}] ${classified.message}`);
  Object.assign(err, {
    code: classified.code,
    action: classified.action,
    exitCode: classified.exitCode,
    stderr: classified.stderr,
  });
  throw err;
}
