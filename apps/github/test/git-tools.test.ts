/**
 * Tests for `clone-repo` and the local `git-*` tools of the GitHub Agent App.
 *
 * The git CLI is mocked: `node:child_process` is replaced, so no process is started, no
 * real repository is read or changed, and nothing reaches the network. Each test queues
 * the answers git would give and asserts the exact argument lists the app passed. A call
 * the test did not queue, or a queued answer nobody asked for, fails the test.
 *
 * The "repository" is an empty temporary directory with a `.git` folder: the tools only
 * check that it exists before they call git.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callTool,
  errorText,
  FAKE_TOKEN,
  installationSecrets,
  type Message,
  mockFetch,
} from './harness.js';

type GitAnswer = { stdout?: string; stderr?: string; status?: number | null };
type ExecAnswer = string | Error;

const git = vi.hoisted(() => ({
  /** Answers for the next `spawnSync('git', ...)` calls, in order. */
  queue: [] as Array<{ stdout?: string; stderr?: string; status?: number | null }>,
  /** Every spawnSync call: [command, args]. */
  calls: [] as Array<[string, string[]]>,
  /** Answers for the next `execFileSync('git', ...)` calls (clone-repo), in order. */
  execQueue: [] as Array<string | Error>,
  /** Every execFileSync call: [command, args, options]. */
  execCalls: [] as Array<[string, string[], Record<string, unknown>]>,
  /** Calls that no test queued an answer for. */
  unexpected: [] as string[],
}));

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  const refuse = (name: string) => () => {
    git.unexpected.push(name);
    throw new Error(`unexpected child_process.${name} in test`);
  };
  return {
    ...real,
    spawnSync: (command: string, args: string[]) => {
      git.calls.push([command, [...args]]);
      const answer = git.queue.shift();
      if (!answer) {
        git.unexpected.push(`spawnSync ${command} ${args.join(' ')}`);
        return { stdout: '', stderr: 'unexpected git call in test', status: 1 };
      }
      return {
        stdout: answer.stdout ?? '',
        stderr: answer.stderr ?? '',
        status: answer.status === undefined ? 0 : answer.status,
      };
    },
    execFileSync: (command: string, args: string[], options: Record<string, unknown>) => {
      git.execCalls.push([command, [...args], options]);
      const answer = git.execQueue.shift();
      if (answer === undefined) {
        git.unexpected.push(`execFileSync ${command} ${args.join(' ')}`);
        throw new Error('unexpected git call in test');
      }
      if (answer instanceof Error) throw answer;
      return answer;
    },
    execSync: refuse('execSync'),
    exec: refuse('exec'),
    execFile: refuse('execFile'),
    spawn: refuse('spawn'),
  };
});

let workspace: string;
let repoPath: string;
const savedWorkspaceEnv = process.env.MCA_WORKSPACE_PATH;

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'agentapps-github-test-'));
  repoPath = join(workspace, 'demo');
  mkdirSync(join(repoPath, '.git'), { recursive: true });
  mkdirSync(join(workspace, 'not-a-repo'));
  process.env.MCA_WORKSPACE_PATH = workspace;
});

afterAll(() => {
  if (savedWorkspaceEnv === undefined) delete process.env.MCA_WORKSPACE_PATH;
  else process.env.MCA_WORKSPACE_PATH = savedWorkspaceEnv;
  rmSync(workspace, { recursive: true, force: true });
});

beforeEach(() => {
  git.queue.length = 0;
  git.calls.length = 0;
  git.execQueue.length = 0;
  git.execCalls.length = 0;
  git.unexpected.length = 0;
});

afterEach(() => {
  expect(git.unexpected, 'git calls the test did not expect').toEqual([]);
  expect(git.queue, 'queued git answers that were never used').toEqual([]);
  expect(git.execQueue, 'queued clone answers that were never used').toEqual([]);
  // The local tools never use fetch (the harness makes any fetch fail).
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

/** Queue the answers of the next git calls. A string is a successful stdout. */
function queueGit(...answers: Array<string | GitAnswer>): void {
  for (const a of answers) git.queue.push(typeof a === 'string' ? { stdout: a } : a);
}

/** The argument lists passed to git, without the leading `-C <repoPath>`. */
function gitArgs(): string[][] {
  return git.calls.map(([command, args]) => {
    expect(command).toBe('git');
    expect(args.slice(0, 2)).toEqual(['-C', repoPath]);
    return args.slice(2);
  });
}

const AUTH_HEADER = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${FAKE_TOKEN}`).toString('base64')}`;
const AUTH_FLAGS = ['-c', `http.extraheader=${AUTH_HEADER}`];
const SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const REV_HEAD = ['rev-parse', 'HEAD'];
const REV_BRANCH = ['rev-parse', '--abbrev-ref', 'HEAD'];
const STATUS = ['status', '--porcelain=v2', '--branch'];
const CLEAN_STATUS = `# branch.oid ${SHA}\n# branch.head main\n`;

const ok = (result: Message) => {
  expect(result.success, errorText(result)).toBe(true);
  return result.result as Record<string, unknown>;
};

describe('clone-repo', () => {
  const dest = () => join(workspace, 'cloned');

  it('clones with the token in a header, never in the URL, and reports the checkout', async () => {
    git.execQueue.push(
      '',
      `${SHA.slice(0, 7)} first commit\n1234567 second commit\n`,
      'main\n',
      `${SHA}\n`,
    );
    const result = ok(
      await callTool('clone-repo', {
        owner: 'octo-org',
        repo: 'demo',
        destination: dest(),
        branch: 'release/1.x',
      }),
    );
    expect(result).toEqual({
      success: true,
      path: dest(),
      branch: 'main',
      sha: SHA,
      recentCommits: [`${SHA.slice(0, 7)} first commit`, '1234567 second commit'],
      output: '',
    });
    expect(git.execCalls.map(([command, args]) => [command, args])).toEqual([
      [
        'git',
        [
          ...AUTH_FLAGS,
          'clone',
          '--branch',
          'release/1.x',
          '--',
          'https://github.com/octo-org/demo.git',
          dest(),
        ],
      ],
      ['git', ['-C', dest(), 'log', '--oneline', '-5']],
      ['git', ['-C', dest(), 'branch', '--show-current']],
      ['git', ['-C', dest(), 'rev-parse', 'HEAD']],
    ]);
    // The clone has a two minute limit and never inherits the terminal.
    expect(git.execCalls[0][2]).toMatchObject({
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // The token is in no argument as plain text, and the URL carries no credentials.
    for (const [, args] of git.execCalls) {
      for (const arg of args) expect(arg).not.toContain(FAKE_TOKEN);
    }
    const url = git.execCalls[0][1].find((a) => a.startsWith('https://')) as string;
    expect(url).toBe('https://github.com/octo-org/demo.git');
    expect(new URL(url).username).toBe('');
    expect(new URL(url).password).toBe('');
    // Nothing went through a shell.
    expect(git.calls).toEqual([]);
  });

  it('clones the default branch when none is given', async () => {
    git.execQueue.push('', 'abc1234 init\n', 'main\n', `${SHA}\n`);
    ok(await callTool('clone-repo', { owner: 'octo-org', repo: 'demo', destination: dest() }));
    expect(git.execCalls[0][1]).toEqual([
      ...AUTH_FLAGS,
      'clone',
      '--',
      'https://github.com/octo-org/demo.git',
      dest(),
    ]);
  });

  const INJECTIONS = ['x"; touch /tmp/x; "', '$(touch /tmp/x)', '--upload-pack=touch /tmp/x'];

  it.each(INJECTIONS)('refuses the owner %j and runs nothing', async (owner) => {
    const result = await callTool('clone-repo', { owner, repo: 'demo', destination: dest() });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('owner and repo must be a GitHub owner and repository name');
    expect(git.execCalls).toEqual([]);
    expect(git.calls).toEqual([]);
  });

  it.each(INJECTIONS)('refuses the repo %j and runs nothing', async (repo) => {
    const result = await callTool('clone-repo', { owner: 'octo-org', repo, destination: dest() });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('owner and repo must be a GitHub owner and repository name');
    expect(git.execCalls).toEqual([]);
    expect(git.calls).toEqual([]);
  });

  it.each([
    ...INJECTIONS,
    '-b',
    'main; rm -rf ~',
    'a b',
    '`id`',
  ])('refuses the branch %j and runs nothing', async (branch) => {
    const result = await callTool('clone-repo', {
      owner: 'octo-org',
      repo: 'demo',
      destination: dest(),
      branch,
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('branch is not a valid branch name');
    expect(git.execCalls).toEqual([]);
    expect(git.calls).toEqual([]);
  });

  it.each([
    '-octo',
    'octo-',
    'octo/org',
    'octo org',
    '',
  ])('refuses the owner %j, which is not a GitHub login', async (owner) => {
    const result = await callTool('clone-repo', { owner, repo: 'demo', destination: dest() });
    expect(result.success).toBe(false);
    expect(git.execCalls).toEqual([]);
  });

  it('refuses a destination that already exists, before anything else', async () => {
    const result = await callTool('clone-repo', {
      owner: 'octo-org',
      repo: 'demo',
      destination: repoPath,
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe(`Destination path already exists: ${repoPath}`);
    expect(git.execCalls).toEqual([]);
  });

  it('fails without running git when the user has no token', async () => {
    delete installationSecrets.USER_ACCESS_TOKEN;
    const result = await callTool('clone-repo', {
      owner: 'octo-org',
      repo: 'demo',
      destination: dest(),
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('GitHub account not connected');
    expect(git.execCalls).toEqual([]);
  });

  it('removes the token and the header from a clone error', async () => {
    const failure = Object.assign(
      new Error(
        `Command failed: git -c http.extraheader=${AUTH_HEADER} clone -- https://github.com/octo-org/demo.git`,
      ),
      { stderr: `fatal: repository not found (${FAKE_TOKEN})\n` },
    );
    git.execQueue.push(failure);
    const result = await callTool('clone-repo', {
      owner: 'octo-org',
      repo: 'demo',
      destination: dest(),
    });
    expect(result.success).toBe(false);
    const message = errorText(result);
    expect(message).toContain(
      'Clone failed: Command failed: git -c http.extraheader=AUTHORIZATION: <REDACTED> clone',
    );
    expect(message).toContain('fatal: repository not found (<TOKEN>)');
    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
    expect(JSON.stringify(result)).not.toContain(AUTH_HEADER);
    expect(JSON.stringify(result)).not.toContain(
      Buffer.from(`x-access-token:${FAKE_TOKEN}`).toString('base64'),
    );
  });

  // With no `destination` the tool uses /workspace/<repo> whatever the workspace is, while
  // every git-* tool resolves `repo` against MCA_WORKSPACE_PATH, /workspace or the current
  // directory (src/tools/clone-repo.ts:36, src/lib/git-local.ts:36). Outside a container
  // the clone lands where no git-* tool will look for it.
  it.todo('clones into the same workspace the git-* tools resolve `repo` against');
  // `destination` is not checked against the workspace: any absolute path is accepted
  // (src/tools/clone-repo.ts:36), unlike `repoPath` in the git-* tools.
  it.todo('refuses a destination outside the workspace');
});

describe('repository path', () => {
  it('resolves `repo` against the workspace', async () => {
    queueGit(CLEAN_STATUS);
    expect(ok(await callTool('git-status', { repo: 'demo' })).repoPath).toBe(repoPath);
  });

  it('accepts an absolute `repoPath` inside the workspace', async () => {
    queueGit(CLEAN_STATUS);
    expect(ok(await callTool('git-status', { repoPath })).repoPath).toBe(repoPath);
  });

  it('refuses a call with neither `repoPath` nor `repo`', async () => {
    const result = await callTool('git-status', {});
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('Either `repoPath`');
    expect(git.calls).toEqual([]);
  });

  it.each([
    { repoPath: '/etc' },
    { repo: '../outside' },
    { repoPath: '../../etc' },
  ])('refuses %j, which is outside the workspace, and runs nothing', async (args) => {
    const result = await callTool('git-status', args);
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('Resolved repo path is outside the workspace');
    expect(git.calls).toEqual([]);
  });

  it('refuses a directory that is not a git repository and runs nothing', async () => {
    const result = await callTool('git-commit', { repo: 'not-a-repo', message: 'x' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('Not a git repository');
    expect(git.calls).toEqual([]);
  });
});

describe('git read tools', () => {
  it('git-status parses branch, upstream, and every kind of entry', async () => {
    queueGit(
      [
        `# branch.oid ${SHA}`,
        '# branch.head main',
        '# branch.upstream origin/main',
        '# branch.ab +2 -1',
        '1 M. N... 100644 100644 100644 aaaaaaa bbbbbbb src/staged file.ts',
        '1 .M N... 100644 100644 100644 aaaaaaa bbbbbbb src/modified.ts',
        '2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 src/new.ts\tsrc/old.ts',
        'u UU N... 100644 100644 100644 100644 aaaaaaa bbbbbbb ccccccc src/conflict.ts',
        '? notes.txt',
        '',
      ].join('\n'),
    );
    const result = ok(await callTool('git-status', { repo: 'demo' }));
    expect(gitArgs()).toEqual([STATUS]);
    expect(result).toEqual({
      repoPath,
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      detached: false,
      staged: [
        { path: 'src/staged file.ts', staged: 'M', worktree: '.' },
        { path: 'src/new.ts', origPath: 'src/old.ts', staged: 'R', worktree: '.' },
      ],
      modified: [{ path: 'src/modified.ts', staged: '.', worktree: 'M' }],
      untracked: [{ path: 'notes.txt', staged: '?', worktree: '?' }],
      conflicted: [{ path: 'src/conflict.ts', staged: 'U', worktree: 'U' }],
      totalChanges: 5,
    });
  });

  it('git-status reports a detached HEAD', async () => {
    queueGit(`# branch.oid ${SHA}\n# branch.head (detached)\n`);
    const result = ok(await callTool('git-status', { repo: 'demo' }));
    expect(result).toMatchObject({ branch: null, detached: true, totalChanges: 0 });
  });

  it('git-status classifies a git failure', async () => {
    queueGit({
      status: 128,
      stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
    });
    const result = await callTool('git-status', { repo: 'demo' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('[GIT_NOT_A_REPO] The path is not a git repository.');
  });

  it('git-diff shows the working tree against HEAD by default', async () => {
    const patch = 'diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1,2 @@\n a\n+b\n';
    queueGit(patch, '1\t0\tsrc/a.ts\n-\t-\tassets/logo.png\n3\t2\tsrc/{old => new}/b.ts\n');
    const result = ok(await callTool('git-diff', { repo: 'demo' }));
    expect(gitArgs()).toEqual([
      ['diff', '-U3'],
      ['diff', '--numstat'],
    ]);
    expect(result).toEqual({
      repoPath,
      from: 'working',
      totals: { files: 3, additions: 4, deletions: 2 },
      files: [
        { path: 'src/a.ts', additions: 1, deletions: 0 },
        { path: 'assets/logo.png', additions: 0, deletions: 0 },
        { path: 'src/new/b.ts', origPath: 'src/old/b.ts', additions: 3, deletions: 2 },
      ],
      patch,
    });
  });

  it('git-diff compares the index, or two refs, limited to a path', async () => {
    queueGit('', '');
    ok(await callTool('git-diff', { repo: 'demo', from: 'staged', path: 'src', contextLines: 0 }));
    queueGit('', '');
    const result = ok(await callTool('git-diff', { repo: 'demo', from: 'v1.0.0', to: 'main' }));
    expect(gitArgs()).toEqual([
      ['diff', '-U0', '--cached', '--', 'src'],
      ['diff', '--numstat', '--cached', '--', 'src'],
      ['diff', '-U3', 'v1.0.0', 'main'],
      ['diff', '--numstat', 'v1.0.0', 'main'],
    ]);
    expect(result).toMatchObject({ from: 'v1.0.0', to: 'main', totals: { files: 0 } });
  });

  it('git-log returns structured commits, 20 by default', async () => {
    const record = (sha: string, subject: string, body: string) =>
      [
        sha,
        sha.slice(0, 7),
        'Octo Test',
        'octo@example.com',
        '2026-11-20T10:00:00+01:00',
        subject,
        body,
      ].join('\x1f');
    queueGit(
      `${record(SHA, 'feat: one', 'Body line\n')}\x1e\n${record('1'.repeat(40), 'fix: two', '')}\x1e`,
    );
    const result = ok(await callTool('git-log', { repo: 'demo' }));
    expect(gitArgs()).toEqual([
      ['log', '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b%x1e', '-n20'],
    ]);
    expect(result).toEqual({
      repoPath,
      ref: 'HEAD',
      total: 2,
      commits: [
        {
          sha: SHA,
          shortSha: SHA.slice(0, 7),
          author: 'Octo Test',
          authorEmail: 'octo@example.com',
          date: '2026-11-20T10:00:00+01:00',
          subject: 'feat: one',
          body: 'Body line',
        },
        {
          sha: '1'.repeat(40),
          shortSha: '1111111',
          author: 'Octo Test',
          authorEmail: 'octo@example.com',
          date: '2026-11-20T10:00:00+01:00',
          subject: 'fix: two',
        },
      ],
    });
  });

  it('git-log passes its filters and caps the limit at 500', async () => {
    queueGit('');
    const result = ok(
      await callTool('git-log', {
        repo: 'demo',
        ref: 'main',
        path: 'src',
        author: 'octo',
        since: '2 weeks ago',
        until: '2026-11-01',
        limit: 9999,
      }),
    );
    expect(gitArgs()[0].slice(2)).toEqual([
      '-n500',
      '--author=octo',
      '--since=2 weeks ago',
      '--until=2026-11-01',
      'main',
      '--',
      'src',
    ]);
    expect(result).toMatchObject({ ref: 'main', total: 0, commits: [] });
  });

  it('git-list-files lists tracked and untracked files, and ignored ones on request', async () => {
    queueGit('src/a.ts\nsrc/b.ts\n', 'notes.txt\n', 'dist/a.js\n');
    const result = ok(
      await callTool('git-list-files', { repo: 'demo', pattern: 'src/**', includeIgnored: true }),
    );
    expect(gitArgs()).toEqual([
      ['ls-files', '--', 'src/**'],
      ['ls-files', '--others', '--exclude-standard', '--', 'src/**'],
      ['ls-files', '--others', '--ignored', '--exclude-standard', '--', 'src/**'],
    ]);
    expect(result).toEqual({
      repoPath,
      tracked: ['src/a.ts', 'src/b.ts'],
      untracked: ['notes.txt'],
      ignored: ['dist/a.js'],
      totals: { tracked: 2, untracked: 1, ignored: 1 },
    });
  });

  it('git-read-file reads the working tree without calling git', async () => {
    writeFileSync(join(repoPath, 'read-me.txt'), 'héllo\n', 'utf-8');
    const result = ok(await callTool('git-read-file', { repo: 'demo', path: 'read-me.txt' }));
    expect(result).toEqual({
      repoPath,
      path: 'read-me.txt',
      ref: 'working-tree',
      encoding: 'utf8',
      content: 'héllo\n',
      size: 7,
    });
    const b64 = ok(
      await callTool('git-read-file', { repo: 'demo', path: 'read-me.txt', encoding: 'base64' }),
    );
    expect(b64.content).toBe(Buffer.from('héllo\n').toString('base64'));
    expect(git.calls).toEqual([]);
  });

  it('git-read-file reads a revision with `git show`', async () => {
    queueGit('old content\n');
    const result = ok(
      await callTool('git-read-file', { repo: 'demo', path: 'src/a.ts', ref: 'v1.0.0' }),
    );
    expect(gitArgs()).toEqual([['show', 'v1.0.0:src/a.ts']]);
    expect(result).toEqual({
      repoPath,
      path: 'src/a.ts',
      ref: 'v1.0.0',
      encoding: 'utf8',
      content: 'old content\n',
      size: 12,
    });
  });

  it('git-read-file refuses a path outside the repository and a missing file', async () => {
    const outside = await callTool('git-read-file', { repo: 'demo', path: '../not-a-repo/x' });
    expect(errorText(outside)).toContain('[GIT_INVALID_PATH] Resolved path escapes the repo');
    const missing = await callTool('git-read-file', { repo: 'demo', path: 'nope.txt' });
    expect(errorText(missing)).toBe('[GIT_REF_NOT_FOUND] File not found in working tree: nope.txt');
    expect(git.calls).toEqual([]);
  });

  it('git-blame attributes each line', async () => {
    const other = '2'.repeat(40);
    queueGit(
      [
        `${SHA} 1 1 2`,
        'author Octo Test',
        'author-mail <octo@example.com>',
        'author-time 1763632800',
        'author-tz +0100',
        'summary feat: one',
        'filename src/a.ts',
        '\tconst a = 1;',
        `${SHA} 2 2`,
        '\tconst b = 2;',
        `${other} 3 3 1`,
        'author Hubot',
        'author-mail <hubot@example.com>',
        'author-time 1763719200',
        'summary fix: two',
        'filename src/a.ts',
        '\t',
        '',
      ].join('\n'),
    );
    const result = ok(
      await callTool('git-blame', { repo: 'demo', path: 'src/a.ts', ref: 'main', range: '1,3' }),
    );
    expect(gitArgs()).toEqual([['blame', '--porcelain', '-L', '1,3', 'main', '--', 'src/a.ts']]);
    const first = {
      sha: SHA,
      author: 'Octo Test',
      authorEmail: 'octo@example.com',
      date: '2025-11-20T10:00:00.000Z',
    };
    expect(result).toEqual({
      repoPath,
      path: 'src/a.ts',
      ref: 'main',
      total: 3,
      lines: [
        { ...first, lineNumber: 1, content: 'const a = 1;' },
        { ...first, lineNumber: 2, content: 'const b = 2;' },
        {
          sha: other,
          author: 'Hubot',
          authorEmail: 'hubot@example.com',
          date: '2025-11-21T10:00:00.000Z',
          lineNumber: 3,
          content: '',
        },
      ],
    });
  });
});

describe('git write tools: index and commits', () => {
  it('git-add stages everything by default and reports what is staged', async () => {
    queueGit(
      '',
      `${CLEAN_STATUS}1 A. N... 000000 100644 100644 0000000 bbbbbbb src/a.ts\n1 .M N... 100644 100644 100644 aaaaaaa bbbbbbb src/b.ts\n? notes.txt\n`,
    );
    const result = ok(await callTool('git-add', { repo: 'demo' }));
    expect(gitArgs()).toEqual([['add', '--', '.'], STATUS]);
    expect(result).toEqual({ repoPath, staged: 1, remaining: 2, stagedFiles: ['src/a.ts'] });
  });

  it('git-add stages the given paths, tracked files only with `update`', async () => {
    queueGit('', CLEAN_STATUS);
    ok(await callTool('git-add', { repo: 'demo', paths: ['src/a.ts', '-weird'], update: true }));
    // Paths go after `--`, so one that starts with a dash is not read as an option.
    expect(gitArgs()[0]).toEqual(['add', '-u', '--', 'src/a.ts', '-weird']);
  });

  it('git-commit commits the staged changes and returns the new HEAD', async () => {
    queueGit('[main 4b825dc] feat: one\n', `${SHA}\n`, 'main\n');
    const result = ok(await callTool('git-commit', { repo: 'demo', message: 'feat: one\n\nBody' }));
    expect(gitArgs()).toEqual([['commit', '-m', 'feat: one\n\nBody'], REV_HEAD, REV_BRANCH]);
    expect(result).toEqual({
      repoPath,
      sha: SHA,
      shortSha: SHA.slice(0, 7),
      branch: 'main',
      message: 'feat: one\n\nBody',
      amended: false,
    });
  });

  it('git-commit passes amend, allowEmpty and author as flags', async () => {
    queueGit('', `${SHA}\n`, 'main\n');
    const result = ok(
      await callTool('git-commit', {
        repo: 'demo',
        message: 'fix',
        amend: true,
        allowEmpty: true,
        author: { name: 'Octo Test', email: 'octo@example.com' },
      }),
    );
    expect(gitArgs()[0]).toEqual([
      'commit',
      '--author=Octo Test <octo@example.com>',
      '--allow-empty',
      '--amend',
      '-m',
      'fix',
    ]);
    expect(result.amended).toBe(true);
  });

  it('git-commit refuses an empty message and runs nothing', async () => {
    const result = await callTool('git-commit', { repo: 'demo', message: '   ' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('[GIT_INVALID_INPUT] Commit message must be a non-empty string');
    expect(git.calls).toEqual([]);
  });

  it('git-commit reports nothing to commit as GIT_NO_CHANGES', async () => {
    queueGit({ status: 1, stdout: 'On branch main\nnothing to commit, working tree clean\n' });
    const result = await callTool('git-commit', { repo: 'demo', message: 'x' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[GIT_NO_CHANGES]');
    expect(gitArgs()).toHaveLength(1);
  });

  it('git-rm removes paths, with --cached and -r on request', async () => {
    queueGit("rm 'src/a.ts'\n");
    const result = ok(await callTool('git-rm', { repo: 'demo', paths: ['src/a.ts'] }));
    expect(result).toEqual({
      repoPath,
      removed: ['src/a.ts'],
      cached: false,
      details: "rm 'src/a.ts'",
    });
    queueGit('');
    ok(await callTool('git-rm', { repo: 'demo', paths: ['dist'], cached: true, recursive: true }));
    expect(gitArgs()).toEqual([
      ['rm', '--', 'src/a.ts'],
      ['rm', '--cached', '-r', '--', 'dist'],
    ]);
  });

  it('git-rm refuses an empty list of paths and runs nothing', async () => {
    const result = await callTool('git-rm', { repo: 'demo', paths: [] });
    expect(errorText(result)).toBe('[GIT_INVALID_INPUT] `paths` must be a non-empty array.');
    expect(git.calls).toEqual([]);
  });

  it('git-mv moves a file, creating the destination directory, with -f on request', async () => {
    queueGit('');
    const result = ok(
      await callTool('git-mv', { repo: 'demo', from: 'a.ts', to: 'moved/dir/b.ts' }),
    );
    expect(result).toEqual({ repoPath, from: 'a.ts', to: 'moved/dir/b.ts', details: '' });
    expect(existsSync(join(repoPath, 'moved/dir'))).toBe(true);
    queueGit('');
    ok(await callTool('git-mv', { repo: 'demo', from: 'a.ts', to: 'b.ts', force: true }));
    expect(gitArgs()).toEqual([
      ['mv', '--', 'a.ts', 'moved/dir/b.ts'],
      ['mv', '-f', '--', 'a.ts', 'b.ts'],
    ]);
  });

  it('git-mv refuses a call without `from` or `to` and runs nothing', async () => {
    const result = await callTool('git-mv', { repo: 'demo', from: 'a.ts', to: '' });
    expect(errorText(result)).toBe('[GIT_INVALID_INPUT] Both `from` and `to` are required.');
    expect(git.calls).toEqual([]);
  });

  it('git-mv refuses a path outside the repository before creating any directory', async () => {
    const outside = join(repoPath, '..', 'escaped-by-git-mv');
    for (const args of [
      { from: 'a.ts', to: '../escaped-by-git-mv/dir/b.ts' },
      { from: '../../etc/passwd', to: 'b.ts' },
    ]) {
      const result = await callTool('git-mv', { repo: 'demo', ...args });
      expect(errorText(result)).toContain('must be a path inside the repository');
    }
    expect(existsSync(outside)).toBe(false);
    expect(git.calls).toEqual([]);
  });

  it('git-write-file writes the file and stages it', async () => {
    queueGit('');
    const result = ok(
      await callTool('git-write-file', {
        repo: 'demo',
        path: 'written/dir/file.txt',
        content: 'héllo\n',
      }),
    );
    expect(gitArgs()).toEqual([['add', '--', 'written/dir/file.txt']]);
    expect(result).toEqual({ repoPath, path: 'written/dir/file.txt', bytes: 7, staged: true });
    expect(readFileSync(join(repoPath, 'written/dir/file.txt'), 'utf-8')).toBe('héllo\n');
  });

  it('git-write-file decodes base64 and skips staging with `stage: false`', async () => {
    const bytes = Buffer.from([0, 255, 16, 32]);
    const result = ok(
      await callTool('git-write-file', {
        repo: 'demo',
        path: 'written/blob.bin',
        content: bytes.toString('base64'),
        encoding: 'base64',
        stage: false,
      }),
    );
    expect(result).toEqual({ repoPath, path: 'written/blob.bin', bytes: 4, staged: false });
    expect(readFileSync(join(repoPath, 'written/blob.bin')).equals(bytes)).toBe(true);
    expect(git.calls).toEqual([]);
  });

  it('git-write-file refuses a path outside the repository and writes nothing', async () => {
    const result = await callTool('git-write-file', {
      repo: 'demo',
      path: '../escaped.txt',
      content: 'x',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[GIT_INVALID_PATH] Resolved path escapes the repo');
    expect(existsSync(join(workspace, 'escaped.txt'))).toBe(false);
    expect(git.calls).toEqual([]);
  });

  it('git-batch-commit applies every change and makes one commit', async () => {
    writeFileSync(join(repoPath, 'untracked-to-delete.txt'), 'x');
    queueGit(
      `${SHA}\n`, // rev-parse HEAD (before)
      CLEAN_STATUS, // status
      '', // add batch/new.ts
      'batch/old.ts\n', // ls-files --error-unmatch (tracked)
      "rm 'batch/old.ts'\n", // rm -f
      {
        status: 1,
        stderr:
          "error: pathspec 'untracked-to-delete.txt' did not match any file(s) known to git\n",
      },
      '', // mv -f
      '[main 1111111] refactor\n', // commit
      `${'1'.repeat(40)}\n`, // rev-parse HEAD
      'main\n', // rev-parse --abbrev-ref HEAD
    );
    const changes = [
      { action: 'create', path: 'batch/new.ts', content: 'export const a = 1;\n' },
      { action: 'delete', path: 'batch/old.ts' },
      { action: 'delete', path: 'untracked-to-delete.txt' },
      { action: 'rename', path: 'batch/renamed.ts', fromPath: 'batch/before.ts' },
    ];
    const result = ok(
      await callTool('git-batch-commit', {
        repo: 'demo',
        message: 'refactor',
        changes,
        author: { name: 'Octo Test', email: 'octo@example.com' },
      }),
    );
    expect(gitArgs()).toEqual([
      REV_HEAD,
      STATUS,
      ['add', '--', 'batch/new.ts'],
      ['ls-files', '--error-unmatch', '--', 'batch/old.ts'],
      ['rm', '-f', '--', 'batch/old.ts'],
      ['ls-files', '--error-unmatch', '--', 'untracked-to-delete.txt'],
      ['mv', '-f', 'batch/before.ts', 'batch/renamed.ts'],
      ['commit', '--author=Octo Test <octo@example.com>', '-m', 'refactor'],
      REV_HEAD,
      REV_BRANCH,
    ]);
    expect(result).toEqual({
      repoPath,
      sha: '1'.repeat(40),
      shortSha: '1111111',
      branch: 'main',
      message: 'refactor',
      changedFiles: [
        { action: 'create', path: 'batch/new.ts' },
        { action: 'delete', path: 'batch/old.ts' },
        { action: 'delete', path: 'untracked-to-delete.txt' },
        { action: 'rename', path: 'batch/renamed.ts', fromPath: 'batch/before.ts' },
      ],
    });
    expect(readFileSync(join(repoPath, 'batch/new.ts'), 'utf-8')).toBe('export const a = 1;\n');
    expect(existsSync(join(repoPath, 'untracked-to-delete.txt'))).toBe(false);
  });

  it('git-batch-commit refuses a dirty tree before changing anything', async () => {
    queueGit(`${SHA}\n`, `${CLEAN_STATUS}? notes.txt\n`);
    const result = await callTool('git-batch-commit', {
      repo: 'demo',
      message: 'm',
      changes: [{ action: 'create', path: 'batch/never.ts', content: 'x' }],
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[GIT_DIRTY_TREE]');
    expect(gitArgs()).toEqual([REV_HEAD, STATUS]);
    expect(existsSync(join(repoPath, 'batch/never.ts'))).toBe(false);
  });

  it('git-batch-commit rolls back with reset --hard and clean -fd when the commit fails', async () => {
    queueGit(
      `${SHA}\n`,
      CLEAN_STATUS,
      '',
      { status: 1, stdout: 'nothing to commit, working tree clean\n' },
      '', // reset --hard
      '', // clean -fd
    );
    const result = await callTool('git-batch-commit', {
      repo: 'demo',
      message: 'm',
      changes: [{ action: 'update', path: 'batch/same.ts', content: 'same' }],
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[GIT_NO_CHANGES]');
    expect(gitArgs().slice(-3)).toEqual([
      ['commit', '-m', 'm'],
      ['reset', '--hard', SHA],
      ['clean', '-fd'],
    ]);
  });

  it.each([
    [
      { message: ' ', changes: [{ action: 'create', path: 'a', content: '' }] },
      '`message` is required',
    ],
    [{ message: 'm', changes: [] }, '`changes` must be a non-empty array'],
    [
      { message: 'm', changes: [{ action: 'create', path: '../x', content: '' }] },
      'Path escapes the repo',
    ],
    [
      { message: 'm', changes: [{ action: 'update', path: 'a' }] },
      'action=update requires `content`',
    ],
    [
      { message: 'm', changes: [{ action: 'rename', path: 'a' }] },
      'action=rename requires `fromPath`',
    ],
    [
      { message: 'm', changes: [{ action: 'rename', path: 'a', fromPath: '../../b' }] },
      'fromPath escapes the repo',
    ],
  ])('git-batch-commit rejects %j and runs nothing', async (args, message) => {
    const result = await callTool('git-batch-commit', { repo: 'demo', ...args });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain(message);
    expect(git.calls).toEqual([]);
  });
});

describe('git write tools: branches and history', () => {
  it('git-checkout switches to a ref and returns the new HEAD', async () => {
    queueGit({ stderr: "Switched to branch 'develop'\n" }, `${SHA}\n`, 'develop\n');
    const result = ok(await callTool('git-checkout', { repo: 'demo', target: 'develop' }));
    expect(gitArgs()).toEqual([['checkout', 'develop'], REV_HEAD, REV_BRANCH]);
    expect(result).toEqual({
      repoPath,
      target: 'develop',
      created: false,
      head: SHA,
      branch: 'develop',
      details: "Switched to branch 'develop'",
    });
  });

  it('git-checkout creates a branch, forces, and restores paths', async () => {
    queueGit('', `${SHA}\n`, 'feature/x\n');
    ok(
      await callTool('git-checkout', {
        repo: 'demo',
        target: 'feature/x',
        create: true,
        force: true,
      }),
    );
    queueGit('', `${SHA}\n`, 'main\n');
    ok(
      await callTool('git-checkout', {
        repo: 'demo',
        target: 'HEAD',
        paths: ['src/a.ts', 'src/b.ts'],
      }),
    );
    expect(gitArgs()[0]).toEqual(['checkout', '--force', '-b', 'feature/x']);
    expect(gitArgs()[3]).toEqual(['checkout', 'HEAD', '--', 'src/a.ts', 'src/b.ts']);
  });

  it('git-checkout refuses an empty target and classifies a branch that already exists', async () => {
    const empty = await callTool('git-checkout', { repo: 'demo', target: ' ' });
    expect(errorText(empty)).toBe(
      '[GIT_INVALID_INPUT] `target` is required (branch, tag, or commit).',
    );
    expect(git.calls).toEqual([]);
    queueGit({ status: 128, stderr: "fatal: a branch named 'main' already exists\n" });
    const exists = await callTool('git-checkout', { repo: 'demo', target: 'main', create: true });
    expect(errorText(exists)).toContain('[GIT_BRANCH_EXISTS]');
  });

  // A ref, remote or tag name that starts with a dash would be read by git as an option.
  it.each([
    ['git-checkout', { target: '--upload-pack=touch /tmp/x' }],
    ['git-merge', { target: '--output=/tmp/x' }],
    ['git-rebase', { onto: '--exec=touch /tmp/x' }],
    ['git-reset', { target: '--hard' }],
    ['git-cherry-pick', { commits: ['abc1234', '--no-verify'] }],
    ['git-log', { ref: '--output=/tmp/x' }],
    ['git-tag', { action: 'create', name: '-d' }],
    ['git-bisect', { action: 'start', bad: '--term-new=x' }],
    ['git-pull', { remote: '--upload-pack=touch /tmp/x' }],
    ['git-push', { remote: '--receive-pack=touch /tmp/x', branch: 'main' }],
    ['git-fetch', { remote: '--upload-pack=touch /tmp/x' }],
    ['git-blame', { path: 'a.ts', ref: '--output=/tmp/x' }],
    ['git-diff', { from: '--output=/tmp/x' }],
    ['git-remote', { action: 'remove', name: '--all' }],
  ])('%s refuses a value that starts with a dash and runs no git command with it', async (tool, args) => {
    const result = await callTool(tool, { repo: 'demo', ...args });
    expect(errorText(result)).toContain('cannot start with "-"');
    expect(
      gitArgs()
        .flat()
        .some((a) => String(a).startsWith('--upload-pack')),
    ).toBe(false);
    expect(gitArgs().flat()).not.toContain('--output=/tmp/x');
  });

  it.each([
    'ext::sh -c "touch /tmp/x"',
    'file:///etc',
    '/tmp/repo',
    '--upload-pack=x',
  ])('git-remote refuses the URL %s', async (url) => {
    const result = await callTool('git-remote', { repo: 'demo', action: 'add', name: 'evil', url });
    expect(errorText(result)).toContain('must be an https://, ssh:// or git@host: remote');
    expect(git.calls).toEqual([]);
  });

  it('git-merge merges a ref with the flags it was given', async () => {
    queueGit('Merge made by the ort strategy.\n', 'main\n', `${SHA}\n`);
    const result = ok(
      await callTool('git-merge', {
        repo: 'demo',
        target: 'feature/x',
        noFf: true,
        strategyOption: 'theirs',
        message: 'Merge feature/x',
      }),
    );
    expect(gitArgs()).toEqual([
      ['merge', '--no-ff', '-X', 'theirs', '-m', 'Merge feature/x', 'feature/x'],
      REV_BRANCH,
      REV_HEAD,
    ]);
    expect(result).toEqual({
      repoPath,
      target: 'feature/x',
      branch: 'main',
      head: SHA,
      squash: false,
      details: 'Merge made by the ort strategy.',
    });
  });

  it('git-merge passes --ff-only and --squash, and reports a conflict as GIT_CONFLICT', async () => {
    queueGit('', 'main\n', `${SHA}\n`);
    expect(
      ok(await callTool('git-merge', { repo: 'demo', target: 'x', ffOnly: true, squash: true }))
        .squash,
    ).toBe(true);
    expect(gitArgs()[0]).toEqual(['merge', '--ff-only', '--squash', 'x']);
    queueGit({
      status: 1,
      stdout:
        'CONFLICT (content): Merge conflict in src/a.ts\nAutomatic merge failed; fix conflicts and then commit the result.\n',
    });
    const conflict = await callTool('git-merge', { repo: 'demo', target: 'y' });
    expect(conflict.success).toBe(false);
    expect(errorText(conflict)).toContain('[GIT_CONFLICT]');
  });

  it('git-rebase rebases onto a ref', async () => {
    queueGit('Successfully rebased and updated refs/heads/feature/x.\n', 'feature/x\n', `${SHA}\n`);
    const result = ok(
      await callTool('git-rebase', {
        repo: 'demo',
        onto: 'main',
        autosquash: true,
        strategyOption: 'theirs',
      }),
    );
    expect(gitArgs()).toEqual([
      ['rebase', '--autosquash', '-X', 'theirs', 'main'],
      REV_BRANCH,
      REV_HEAD,
    ]);
    expect(result).toEqual({
      repoPath,
      mode: 'start',
      onto: 'main',
      branch: 'feature/x',
      head: SHA,
      details: 'Successfully rebased and updated refs/heads/feature/x.',
    });
  });

  it.each([
    'continue',
    'skip',
    'abort',
  ])('git-rebase drives a rebase in progress with %s', async (mode) => {
    queueGit('', 'main\n', `${SHA}\n`);
    ok(await callTool('git-rebase', { repo: 'demo', mode }));
    expect(gitArgs()[0]).toEqual(['rebase', `--${mode}`]);
  });

  it('git-rebase refuses to start without `onto` and runs nothing', async () => {
    const result = await callTool('git-rebase', { repo: 'demo' });
    expect(errorText(result)).toBe('[GIT_INVALID_INPUT] `onto` is required for `mode: start`.');
    expect(git.calls).toEqual([]);
  });

  it('git-reset resets HEAD, mixed by default', async () => {
    queueGit('Unstaged changes after reset:\nM\tsrc/a.ts\n', `${SHA}\n`, 'main\n');
    const result = ok(await callTool('git-reset', { repo: 'demo' }));
    expect(gitArgs()).toEqual([['reset', '--mixed', 'HEAD'], REV_HEAD, REV_BRANCH]);
    expect(result).toEqual({
      repoPath,
      mode: 'mixed',
      target: 'HEAD',
      head: SHA,
      branch: 'main',
      details: 'Unstaged changes after reset:\nM\tsrc/a.ts',
    });
  });

  it('git-reset discards everything with mode "hard"', async () => {
    queueGit('HEAD is now at 4b825dc feat: one\n', `${SHA}\n`, 'main\n');
    ok(await callTool('git-reset', { repo: 'demo', mode: 'hard', target: 'HEAD~1' }));
    expect(gitArgs()[0]).toEqual(['reset', '--hard', 'HEAD~1']);
  });

  it('git-cherry-pick picks commits in order', async () => {
    queueGit('[main 1111111] fix\n', `${SHA}\n`, 'main\n');
    const result = ok(
      await callTool('git-cherry-pick', {
        repo: 'demo',
        commits: ['abc1234', 'def5678'],
        noCommit: true,
        mainline: 1,
      }),
    );
    expect(gitArgs()).toEqual([
      ['cherry-pick', '-n', '-m', '1', 'abc1234', 'def5678'],
      REV_HEAD,
      REV_BRANCH,
    ]);
    expect(result).toEqual({
      repoPath,
      mode: 'start',
      commits: ['abc1234', 'def5678'],
      branch: 'main',
      head: SHA,
      details: '[main 1111111] fix',
    });
  });

  it('git-cherry-pick aborts a pick in progress and refuses to start without commits', async () => {
    queueGit('', `${SHA}\n`, 'main\n');
    ok(await callTool('git-cherry-pick', { repo: 'demo', mode: 'abort' }));
    expect(gitArgs()).toEqual([['cherry-pick', '--abort'], REV_HEAD, REV_BRANCH]);
    const result = await callTool('git-cherry-pick', { repo: 'demo', commits: [] });
    expect(errorText(result)).toBe(
      '[GIT_INVALID_INPUT] `commits` array is required for `mode: start`.',
    );
    expect(git.calls).toHaveLength(3);
  });

  it('git-stash pushes by default, with -u and a message on request', async () => {
    queueGit('Saved working directory and index state On main: wip\n');
    const result = ok(
      await callTool('git-stash', { repo: 'demo', message: 'wip', includeUntracked: true }),
    );
    expect(gitArgs()).toEqual([['stash', 'push', '-u', '-m', 'wip']]);
    expect(result).toEqual({
      repoPath,
      action: 'push',
      details: 'Saved working directory and index state On main: wip',
    });
  });

  it.each([
    ['pop', { index: 2 }, ['stash', 'pop', 'stash@{2}']],
    ['apply', {}, ['stash', 'apply', 'stash@{0}']],
    ['drop', { index: 1 }, ['stash', 'drop', 'stash@{1}']],
    ['clear', {}, ['stash', 'clear']],
  ])('git-stash %s runs the matching command', async (action, extra, argv) => {
    queueGit('');
    const result = ok(await callTool('git-stash', { repo: 'demo', action, ...extra }));
    expect(gitArgs()).toEqual([argv]);
    expect(result).toEqual({ repoPath, action, details: '' });
  });

  it('git-stash list returns the entries', async () => {
    queueGit('stash@{0}: On main: wip\nstash@{1}: WIP on main: 4b825dc feat: one\n');
    const result = ok(await callTool('git-stash', { repo: 'demo', action: 'list' }));
    expect(gitArgs()).toEqual([['stash', 'list']]);
    expect(result).toEqual({
      repoPath,
      action: 'list',
      entries: [
        { ref: 'stash@{0}', description: 'On main: wip' },
        { ref: 'stash@{1}', description: 'WIP on main: 4b825dc feat: one' },
      ],
      total: 2,
    });
  });

  it('git-tag lists tags by default', async () => {
    queueGit('v1.0.0\nv1.1.0\n');
    const result = ok(await callTool('git-tag', { repo: 'demo', pattern: 'v1.*' }));
    expect(gitArgs()).toEqual([['tag', '-l', 'v1.*']]);
    expect(result).toEqual({ repoPath, action: 'list', tags: ['v1.0.0', 'v1.1.0'], total: 2 });
  });

  it('git-tag creates an annotated tag, replacing one with `force`', async () => {
    queueGit('');
    const result = ok(
      await callTool('git-tag', {
        repo: 'demo',
        action: 'create',
        name: 'v1.2.0',
        ref: 'main',
        message: 'Release 1.2.0',
        force: true,
      }),
    );
    expect(gitArgs()).toEqual([['tag', '-f', '-a', '-m', 'Release 1.2.0', 'v1.2.0', 'main']]);
    expect(result).toEqual({
      repoPath,
      action: 'create',
      name: 'v1.2.0',
      ref: 'main',
      annotated: true,
    });
  });

  it('git-tag deletes a tag, and refuses create or delete without a name', async () => {
    queueGit("Deleted tag 'v1.2.0' (was 4b825dc)\n");
    const result = ok(
      await callTool('git-tag', { repo: 'demo', action: 'delete', name: 'v1.2.0' }),
    );
    expect(gitArgs()).toEqual([['tag', '-d', 'v1.2.0']]);
    expect(result).toEqual({ repoPath, action: 'delete', name: 'v1.2.0' });
    const noName = await callTool('git-tag', { repo: 'demo', action: 'delete' });
    expect(errorText(noName)).toBe('[GIT_INVALID_INPUT] `name` is required for create/delete.');
    expect(git.calls).toHaveLength(1);
  });

  it('git-bisect starts, marks, resets and shows the state', async () => {
    queueGit('Bisecting: 3 revisions left to test after this (roughly 2 steps)\n', `${SHA}\n`);
    const start = ok(
      await callTool('git-bisect', { repo: 'demo', action: 'start', bad: 'HEAD', good: 'v1.0.0' }),
    );
    expect(start).toEqual({
      repoPath,
      action: 'start',
      head: SHA,
      details: 'Bisecting: 3 revisions left to test after this (roughly 2 steps)',
    });
    queueGit('', `${SHA}\n`, '', `${SHA}\n`, '', `${SHA}\n`, '', `${SHA}\n`);
    ok(await callTool('git-bisect', { repo: 'demo', action: 'good', ref: 'abc1234' }));
    ok(await callTool('git-bisect', { repo: 'demo', action: 'bad' }));
    ok(await callTool('git-bisect', { repo: 'demo', action: 'reset' }));
    ok(await callTool('git-bisect', { repo: 'demo' }));
    expect(gitArgs().filter((a) => a[0] === 'bisect')).toEqual([
      ['bisect', 'start', 'HEAD', 'v1.0.0'],
      ['bisect', 'good', 'abc1234'],
      ['bisect', 'bad'],
      ['bisect', 'reset'],
      ['bisect', 'visualize', '--oneline'],
    ]);
  });

  it('git-bisect refuses to start without `bad` and runs nothing', async () => {
    const result = await callTool('git-bisect', { repo: 'demo', action: 'start' });
    expect(errorText(result)).toBe('[GIT_INVALID_INPUT] `bad` is required for `action: start`.');
    expect(git.calls).toEqual([]);
  });
});

describe('git write tools: configuration and remotes', () => {
  it('git-config reads a key from the local scope by default', async () => {
    queueGit('Octo Test\n');
    const result = ok(await callTool('git-config', { repo: 'demo', key: 'user.name' }));
    expect(gitArgs()).toEqual([['config', '--local', '--get', 'user.name']]);
    expect(result).toEqual({ repoPath, scope: 'local', key: 'user.name', value: 'Octo Test' });
  });

  it('git-config returns null for a key that is not set', async () => {
    queueGit({ status: 1 });
    const result = ok(await callTool('git-config', { repo: 'demo', key: 'user.email' }));
    expect(result).toEqual({ repoPath, scope: 'local', key: 'user.email', value: null });
  });

  it('git-config sets and unsets a key, in the global scope on request', async () => {
    queueGit('');
    const set = ok(
      await callTool('git-config', {
        repo: 'demo',
        action: 'set',
        key: 'user.email',
        value: 'octo@example.com',
        scope: 'global',
      }),
    );
    expect(set).toEqual({
      repoPath,
      scope: 'global',
      key: 'user.email',
      value: 'octo@example.com',
    });
    // Exit code 5 is "the key was not set": unset treats it as done.
    queueGit({ status: 5 });
    const unset = ok(
      await callTool('git-config', { repo: 'demo', action: 'unset', key: 'pull.rebase' }),
    );
    expect(unset).toEqual({ repoPath, scope: 'local', key: 'pull.rebase', value: null });
    expect(gitArgs()).toEqual([
      ['config', '--global', 'user.email', 'octo@example.com'],
      ['config', '--local', '--unset', 'pull.rebase'],
    ]);
  });

  it('git-config list returns only the allowed keys', async () => {
    queueGit(
      'user.name=Octo Test\ncore.editor=vim\nremote.origin.url=https://github.com/octo-org/demo.git\nhttp.extraheader=AUTHORIZATION: basic abc\n',
    );
    const result = ok(await callTool('git-config', { repo: 'demo', action: 'list' }));
    expect(gitArgs()).toEqual([['config', '--local', '--list']]);
    expect(result).toEqual({
      repoPath,
      scope: 'local',
      entries: { 'user.name': 'Octo Test' },
    });
  });

  it.each([
    [{ action: 'get' }, '`key` is required for get/set/unset.'],
    [
      { action: 'set', key: 'core.sshCommand', value: 'touch /tmp/x' },
      'Key not whitelisted: core.sshCommand',
    ],
    [
      { action: 'set', key: 'http.extraheader', value: 'x' },
      'Key not whitelisted: http.extraheader',
    ],
    [{ action: 'get', key: 'remote.origin.url' }, 'Key not whitelisted: remote.origin.url'],
    [{ action: 'set', key: 'user.name' }, '`value` is required for action=set.'],
  ])('git-config rejects %j and runs nothing', async (args, message) => {
    const result = await callTool('git-config', { repo: 'demo', ...args });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain(message);
    expect(git.calls).toEqual([]);
  });

  it.each([
    'core.editor',
    'core.pager',
  ])('git-config refuses to set %s, whose value git runs as a command', async (key) => {
    const result = await callTool('git-config', {
      repo: 'demo',
      action: 'set',
      key,
      value: 'touch /tmp/x',
      scope: 'global',
    });
    expect(errorText(result)).toContain(`Key not whitelisted: ${key}`);
    expect(git.calls).toEqual([]);
  });

  it('git-remote lists remotes with their fetch and push URLs', async () => {
    queueGit(
      'origin\thttps://github.com/octo-org/demo.git (fetch)\norigin\thttps://github.com/octo-org/demo.git (push)\nfork\thttps://github.com/octo-test/demo.git (fetch)\n',
    );
    const result = ok(await callTool('git-remote', { repo: 'demo' }));
    expect(gitArgs()).toEqual([['remote', '-v']]);
    expect(result).toEqual({
      repoPath,
      action: 'list',
      remotes: [
        {
          name: 'origin',
          fetchUrl: 'https://github.com/octo-org/demo.git',
          pushUrl: 'https://github.com/octo-org/demo.git',
        },
        { name: 'fork', fetchUrl: 'https://github.com/octo-test/demo.git' },
      ],
      total: 2,
    });
  });

  it('git-remote adds, changes and removes a remote', async () => {
    queueGit('', '', '');
    const url = 'https://github.com/octo-test/demo.git';
    expect(
      ok(await callTool('git-remote', { repo: 'demo', action: 'add', name: 'fork', url })),
    ).toEqual({
      repoPath,
      action: 'add',
      name: 'fork',
      url,
    });
    ok(await callTool('git-remote', { repo: 'demo', action: 'set-url', name: 'fork', url }));
    expect(
      ok(await callTool('git-remote', { repo: 'demo', action: 'remove', name: 'fork' })),
    ).toEqual({
      repoPath,
      action: 'remove',
      name: 'fork',
    });
    expect(gitArgs()).toEqual([
      ['remote', 'add', 'fork', url],
      ['remote', 'set-url', 'fork', url],
      ['remote', 'remove', 'fork'],
    ]);
  });

  it.each([
    [
      { action: 'add', url: 'https://example.com/x.git' },
      '`name` is required for add/remove/set-url.',
    ],
    [{ action: 'add', name: 'fork' }, '`url` is required for add/set-url.'],
  ])('git-remote rejects %j and runs nothing', async (args, message) => {
    const result = await callTool('git-remote', { repo: 'demo', ...args });
    expect(errorText(result)).toBe(`[GIT_INVALID_INPUT] ${message}`);
    expect(git.calls).toEqual([]);
  });
});

describe('git write tools: talking to the remote', () => {
  it('git-push pushes the current branch with the token in a header and sets the upstream', async () => {
    queueGit('main\n', {
      stderr: 'To https://github.com/octo-org/demo.git\n   4b825dc..1111111  main -> main\n',
    });
    const result = ok(await callTool('git-push', { repo: 'demo' }));
    expect(gitArgs()).toEqual([REV_BRANCH, [...AUTH_FLAGS, 'push', '-u', 'origin', 'main']]);
    expect(result).toEqual({
      repoPath,
      remote: 'origin',
      branch: 'main',
      forced: 'none',
      details: 'To https://github.com/octo-org/demo.git\n   4b825dc..1111111  main -> main',
    });
    for (const args of gitArgs()) for (const arg of args) expect(arg).not.toContain(FAKE_TOKEN);
  });

  it.each([
    [{ force: true }, ['--force-with-lease'], 'lease'],
    [{ forceUnsafe: true, force: true }, ['--force'], 'unsafe'],
  ])('git-push with %j passes %j', async (extra, flags, forced) => {
    queueGit('');
    const result = ok(
      await callTool('git-push', {
        repo: 'demo',
        branch: 'feature/x',
        remote: 'fork',
        setUpstream: false,
        tags: true,
        ...extra,
      }),
    );
    expect(gitArgs()).toEqual([[...AUTH_FLAGS, 'push', '--tags', ...flags, 'fork', 'feature/x']]);
    expect(result.forced).toBe(forced);
  });

  it('git-push refuses to push from a detached HEAD', async () => {
    queueGit('HEAD\n');
    const result = await callTool('git-push', { repo: 'demo' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[GIT_DETACHED_HEAD]');
    expect(gitArgs()).toEqual([REV_BRANCH]);
  });

  it('git-push fails without pushing when the user has no token', async () => {
    delete installationSecrets.USER_ACCESS_TOKEN;
    const result = await callTool('git-push', { repo: 'demo', branch: 'main' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('GitHub account not connected');
    expect(git.calls).toEqual([]);
  });

  it('git-push reports a rejected push as GIT_PUSH_REJECTED', async () => {
    queueGit({
      status: 1,
      stderr:
        ' ! [rejected]        main -> main (non-fast-forward)\nerror: failed to push some refs\nhint: Updates were rejected because the tip of your current branch is behind\n',
    });
    const result = await callTool('git-push', { repo: 'demo', branch: 'main' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[GIT_PUSH_REJECTED]');
    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
  });

  it('redacts tokens that git prints', async () => {
    queueGit({
      stderr:
        'To https://x-access-token:s3cr3t@github.com/octo-org/demo.git\nremote: ghu_0123456789abcdefABCDEF\n',
    });
    const result = ok(await callTool('git-push', { repo: 'demo', branch: 'main' }));
    expect(result.details).toBe(
      'To https://x-access-token:<REDACTED>@github.com/octo-org/demo.git\nremote: <REDACTED_GH_TOKEN>',
    );
  });

  it('git-pull pulls with the token in a header and returns the new HEAD', async () => {
    queueGit('Updating 4b825dc..1111111\nFast-forward\n', 'main\n', `${SHA}\n`);
    const result = ok(
      await callTool('git-pull', {
        repo: 'demo',
        remote: 'origin',
        branch: 'main',
        rebase: true,
        ff: 'only',
      }),
    );
    expect(gitArgs()).toEqual([
      [...AUTH_FLAGS, 'pull', '--rebase', '--ff-only', 'origin', 'main'],
      REV_BRANCH,
      REV_HEAD,
    ]);
    expect(result).toEqual({
      repoPath,
      remote: 'origin',
      branch: 'main',
      head: SHA,
      rebase: true,
      details: 'Updating 4b825dc..1111111\nFast-forward',
    });
  });

  it('git-pull with no arguments lets git choose the remote, and --no-ff forces a merge commit', async () => {
    queueGit('Already up to date.\n', 'main\n', `${SHA}\n`);
    ok(await callTool('git-pull', { repo: 'demo' }));
    queueGit('', 'main\n', `${SHA}\n`);
    ok(await callTool('git-pull', { repo: 'demo', ff: 'no' }));
    expect(gitArgs()[0]).toEqual([...AUTH_FLAGS, 'pull']);
    expect(gitArgs()[3]).toEqual([...AUTH_FLAGS, 'pull', '--no-ff']);
  });

  it('git-pull with `branch` and no `remote` pulls that branch from origin', async () => {
    queueGit('');
    queueGit('main');
    queueGit('abc1234');
    ok(await callTool('git-pull', { repo: 'demo', branch: 'main' }));
    expect(gitArgs()[0]).toEqual([...AUTH_FLAGS, 'pull', 'origin', 'main']);
  });

  it('git-pull fails without running git when the user has no token', async () => {
    delete installationSecrets.USER_ACCESS_TOKEN;
    const result = await callTool('git-pull', { repo: 'demo' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('GitHub account not connected');
    expect(git.calls).toEqual([]);
  });

  it('git-pull reports local changes in the way as GIT_DIRTY_TREE', async () => {
    queueGit({
      status: 1,
      stderr:
        'error: Your local changes to the following files would be overwritten by merge:\n\tsrc/a.ts\nPlease commit your changes or stash them before you merge.\n',
    });
    const result = await callTool('git-pull', { repo: 'demo' });
    expect(errorText(result)).toContain('[GIT_DIRTY_TREE]');
  });

  it('git-fetch fetches from origin with the token in a header', async () => {
    queueGit({
      stderr:
        'From https://github.com/octo-org/demo\n * [new branch]      feature/x -> origin/feature/x\n',
    });
    const result = ok(await callTool('git-fetch', { repo: 'demo' }));
    expect(gitArgs()).toEqual([[...AUTH_FLAGS, 'fetch', 'origin']]);
    expect(result).toEqual({
      repoPath,
      remote: 'origin',
      details:
        'From https://github.com/octo-org/demo\n * [new branch]      feature/x -> origin/feature/x',
    });
  });

  it('git-fetch passes depth, prune, tags and a refspec', async () => {
    queueGit('', '');
    const result = ok(
      await callTool('git-fetch', {
        repo: 'demo',
        remote: 'fork',
        refspec: 'pull/12/head:pr-12',
        depth: 1,
        prune: true,
        tags: false,
      }),
    );
    ok(await callTool('git-fetch', { repo: 'demo', tags: true }));
    expect(gitArgs()).toEqual([
      [
        ...AUTH_FLAGS,
        'fetch',
        '--depth',
        '1',
        '--prune',
        '--no-tags',
        'fork',
        'pull/12/head:pr-12',
      ],
      [...AUTH_FLAGS, 'fetch', '--tags', 'origin'],
    ]);
    expect(result).toMatchObject({ remote: 'fork', refspec: 'pull/12/head:pr-12' });
  });

  it('git-fetch reports an unreachable remote as GIT_NETWORK_ERROR and a rejected token as GIT_AUTH_FAILED', async () => {
    queueGit({
      status: 128,
      stderr:
        "fatal: unable to access 'https://github.com/octo-org/demo.git/': Could not resolve host: github.com\n",
    });
    expect(errorText(await callTool('git-fetch', { repo: 'demo' }))).toBe(
      '[GIT_NETWORK_ERROR] Could not reach the remote.',
    );
    queueGit({
      status: 128,
      stderr:
        "remote: Invalid username or token.\nfatal: Authentication failed for 'https://github.com/octo-org/demo.git/'\n",
    });
    expect(errorText(await callTool('git-fetch', { repo: 'demo' }))).toContain('[GIT_AUTH_FAILED]');
  });

  it('reports a git that did not run (no exit status) as a timeout', async () => {
    queueGit({ status: null });
    const result = await callTool('git-fetch', { repo: 'demo' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('[GIT_TIMEOUT]');
  });
});

describe('the fetch stub is never used by the local tools', () => {
  it('fails a test that reaches the network', async () => {
    // Guard for this file's own setup: `fetch` is the harness stub, not the real one.
    mockFetch();
    await expect(fetch('https://api.github.com/')).rejects.toThrow('unexpected fetch in test');
    vi.mocked(fetch).mockClear();
  });
});
