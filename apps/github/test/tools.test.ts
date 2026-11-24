/**
 * Health, client and REST tool tests for the GitHub Agent App. The API is mocked (fetch):
 * no real request and no real credential. The local `git-*` tools and `clone-repo` are in
 * git-tools.test.ts.
 *
 * Mock bodies follow the shapes of the GitHub REST API reference (version 2022-11-28) with
 * synthetic values: ids stay numbers, a 204 has no body, error bodies carry `message` and
 * `documentation_url`.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  callTool,
  errorText,
  FAKE_TOKEN,
  installationSecrets,
  jsonResponse,
  mockFetch,
  requestOf,
  runHealthCheck,
  systemSecrets,
} from './harness.js';

// Nothing in this file may start a process: the REST tools only use fetch.
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  const refuse = (name: string) => () => {
    throw new Error(`unexpected child_process.${name} in test`);
  };
  return {
    ...real,
    spawnSync: refuse('spawnSync'),
    execFileSync: refuse('execFileSync'),
    execSync: refuse('execSync'),
    exec: refuse('exec'),
    execFile: refuse('execFile'),
    spawn: refuse('spawn'),
  };
});

const API = 'https://api.github.com';
const REPO = { owner: 'octo-org', repo: 'demo' };
const R = '/repos/octo-org/demo';

const noContent = () => new Response(null, { status: 204, statusText: 'No Content' });
const bodyOf = (fetchMock: ReturnType<typeof mockFetch>, n = 0) =>
  JSON.parse(String(requestOf(fetchMock, n).init.body));
const headersOf = (fetchMock: ReturnType<typeof mockFetch>, n = 0) =>
  requestOf(fetchMock, n).init.headers as Record<string, string>;
const queryOf = (fetchMock: ReturnType<typeof mockFetch>, n = 0) =>
  Object.fromEntries(requestOf(fetchMock, n).url.searchParams);

function githubError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return jsonResponse(
    {
      message,
      documentation_url: 'https://docs.github.com/rest',
      status: String(status),
      ...extra,
    },
    status,
  );
}

/** A repository as the API returns it, cut down to the fields the app reads plus a few more. */
function repoBody(id: number, fullName: string, isPrivate = false) {
  const [login, name] = fullName.split('/');
  return {
    id,
    node_id: `R_${id}`,
    name,
    full_name: fullName,
    private: isPrivate,
    visibility: isPrivate ? 'private' : 'public',
    owner: {
      login,
      id: id + 1,
      avatar_url: `https://avatars.example.com/u/${id + 1}`,
      type: 'User',
    },
    html_url: `https://github.com/${fullName}`,
    description: null,
    fork: false,
    default_branch: 'main',
    language: 'TypeScript',
    stargazers_count: 3,
    forks_count: 0,
    open_issues_count: 2,
    archived: false,
    pushed_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
    permissions: { admin: false, push: true, pull: true },
  };
}

describe('health', () => {
  it('reports ready when the GitHub App is configured and the user has a token, without any request', async () => {
    const fetchMock = mockFetch();
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(health.message).toBe('GitHub connected');
    // The token is not validated here: the first tool call does that.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports not_ready with USER_NOT_AUTHENTICATED and the install link when there is no user token', async () => {
    delete installationSecrets.USER_ACCESS_TOKEN;
    const fetchMock = mockFetch();
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('GitHub account not connected for this user');
    expect(health.issues).toEqual([
      {
        code: 'USER_NOT_AUTHENTICATED',
        message: 'Connect your GitHub account so actions are signed with your identity.',
        severity: 'warning',
        action: {
          type: 'link',
          url: 'https://github.com/apps/agentapps-test/installations/new',
          label: 'Connect GitHub',
        },
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports not_ready when the installation has no secrets at all', async () => {
    for (const key of Object.keys(installationSecrets)) delete installationSecrets[key];
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(JSON.stringify(health.issues)).toContain('USER_NOT_AUTHENTICATED');
  });

  it('falls back to the `agentapps` slug in the install link when GITHUB_APP_SLUG is not set', async () => {
    delete installationSecrets.USER_ACCESS_TOKEN;
    delete systemSecrets.GITHUB_APP_SLUG;
    const health = await runHealthCheck();
    expect(JSON.stringify(health.issues)).toContain(
      'https://github.com/apps/agentapps/installations/new',
    );
  });

  it.each([
    'GITHUB_APP_ID',
    'GITHUB_APP_PRIVATE_KEY',
  ])('reports not_ready with SYSTEM_NOT_CONFIGURED when %s is missing', async (key) => {
    delete systemSecrets[key];
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('GitHub App not configured by admin');
    expect(JSON.stringify(health.issues)).toContain('SYSTEM_NOT_CONFIGURED');
  });

  // The SYSTEM_NOT_CONFIGURED message says GITHUB_APP_WEBHOOK_SECRET "must be set", but the
  // check in src/app.ts only looks at GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.
  it.todo('reports not_ready when GITHUB_APP_WEBHOOK_SECRET is missing, as its own message says');
});

describe('client', () => {
  it('sends the user token and the GitHub API headers', async () => {
    const fetchMock = mockFetch(jsonResponse(repoBody(1, 'octo-org/demo')));
    const result = await callTool('get-repo', REPO);
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(headersOf(fetchMock)).toEqual({
      Authorization: `Bearer ${FAKE_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'AgentApps-GitHub',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  });

  it('fails without a request, naming the install URL, when the user has no token', async () => {
    delete installationSecrets.USER_ACCESS_TOKEN;
    const fetchMock = mockFetch();
    const result = await callTool('get-repo', REPO);
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe(
      'GitHub account not connected. Reconnect at https://github.com/apps/agentapps-test/installations/new to continue.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails a write the same way when the user has no token', async () => {
    delete installationSecrets.USER_ACCESS_TOKEN;
    const fetchMock = mockFetch();
    const result = await callTool('create-issue', { ...REPO, title: 'x' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('GitHub account not connected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the API's message on a 404", async () => {
    const fetchMock = mockFetch(githubError(404, 'Not Found'));
    const result = await callTool('get-repo', REPO);
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Not Found');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the API's message on a 401 and does not retry or refresh", async () => {
    const fetchMock = mockFetch(githubError(401, 'Bad credentials'));
    const result = await callTool('get-repo', REPO);
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Bad credentials');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the API's message on a 403 rate limit", async () => {
    const fetchMock = mockFetch(githubError(403, 'API rate limit exceeded for user ID 1.', {}));
    const result = await callTool('search-code', { query: 'x' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('API rate limit exceeded for user ID 1.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns only `message` on a 422, and never retries a write', async () => {
    const fetchMock = mockFetch(
      githubError(422, 'Validation Failed', {
        errors: [{ resource: 'Issue', field: 'title', code: 'missing_field' }],
      }),
    );
    const result = await callTool('create-issue', { ...REPO, title: '' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Validation Failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the raw text of an error body that is not JSON', async () => {
    mockFetch(new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    const result = await callTool('get-repo', REPO);
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('<html>Bad Gateway</html>');
  });

  it('falls back to the status text when the error has no body', async () => {
    mockFetch(new Response('', { status: 500, statusText: 'Internal Server Error' }));
    const result = await callTool('get-repo', REPO);
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Internal Server Error');
  });

  it('passes a network failure through and keeps the token out of the message', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const result = await callTool('get-repo', REPO);
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('fetch failed');
    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
  });

  // Today a call without its required arguments is not rejected: `get-repo {}` requests
  // /repos/undefined/undefined (src/tools/get-repo.ts:26, and the same in every REST tool).
  it.todo('rejects a call without the required `owner` and `repo` before any request');
});

describe('read tools', () => {
  /** [tool, arguments, expected path, expected query] — each one is a single GET. */
  const READS: Array<[string, Record<string, unknown>, string, Record<string, string>]> = [
    ['get-repo', REPO, R, {}],
    [
      'search-repos',
      { query: 'agent apps language:typescript', sort: 'stars', per_page: 5 },
      '/search/repositories',
      { q: 'agent apps language:typescript', sort: 'stars', per_page: '5' },
    ],
    [
      'list-issues',
      { ...REPO, state: 'open', labels: 'bug,help wanted', sort: 'updated', per_page: 10 },
      `${R}/issues`,
      { state: 'open', labels: 'bug,help wanted', sort: 'updated', per_page: '10' },
    ],
    ['get-issue', { ...REPO, issue_number: 7 }, `${R}/issues/7`, {}],
    [
      'search-issues',
      { q: 'repo:octo-org/demo is:open', sort: 'updated', order: 'desc', per_page: 5, page: 2 },
      '/search/issues',
      { q: 'repo:octo-org/demo is:open', sort: 'updated', order: 'desc', per_page: '5', page: '2' },
    ],
    [
      'list-pulls',
      { ...REPO, state: 'all', sort: 'updated', per_page: 3 },
      `${R}/pulls`,
      { state: 'all', sort: 'updated', per_page: '3' },
    ],
    ['get-pull', { ...REPO, pull_number: 12 }, `${R}/pulls/12`, {}],
    [
      'list-pr-files',
      { ...REPO, pull_number: 12, per_page: 50, page: 2 },
      `${R}/pulls/12/files`,
      { per_page: '50', page: '2' },
    ],
    ['list-pr-commits', { ...REPO, pull_number: 12 }, `${R}/pulls/12/commits`, {}],
    [
      'list-pr-review-comments',
      { ...REPO, pull_number: 12, sort: 'created', direction: 'asc' },
      `${R}/pulls/12/comments`,
      { sort: 'created', direction: 'asc' },
    ],
    ['list-branches', { ...REPO, per_page: 100 }, `${R}/branches`, { per_page: '100' }],
    ['get-branch', { ...REPO, branch: 'main' }, `${R}/branches/main`, {}],
    [
      'list-commits',
      { ...REPO, sha: 'main', per_page: 2 },
      `${R}/commits`,
      { sha: 'main', per_page: '2' },
    ],
    ['get-commit', { ...REPO, ref: 'a1b2c3d' }, `${R}/commits/a1b2c3d`, {}],
    [
      'compare-commits',
      { ...REPO, basehead: 'main...feature/x', per_page: 10 },
      `${R}/compare/main...feature%2Fx`,
      { per_page: '10' },
    ],
    ['list-workflows', REPO, `${R}/actions/workflows`, {}],
    [
      'list-workflow-runs',
      { ...REPO, status: 'failure', per_page: 5 },
      `${R}/actions/runs`,
      { status: 'failure', per_page: '5' },
    ],
    [
      'list-workflow-runs',
      { ...REPO, workflow_id: 'ci.yml' },
      `${R}/actions/workflows/ci.yml/runs`,
      {},
    ],
    ['get-workflow-run', { ...REPO, run_id: 9001 }, `${R}/actions/runs/9001`, {}],
    [
      'list-workflow-run-jobs',
      { ...REPO, run_id: 9001, filter: 'latest' },
      `${R}/actions/runs/9001/jobs`,
      { filter: 'latest' },
    ],
    [
      'list-releases',
      { ...REPO, per_page: 1, page: 1 },
      `${R}/releases`,
      { per_page: '1', page: '1' },
    ],
    [
      'search-code',
      { query: 'createApp repo:octo-org/demo', per_page: 5 },
      '/search/code',
      { q: 'createApp repo:octo-org/demo', per_page: '5' },
    ],
    ['get-rate-limit', {}, '/rate_limit', {}],
  ];

  it.each(
    READS,
  )('%s %j sends one GET and returns the body as is', async (tool, args, path, query) => {
    const body = { total_count: 1, items: [{ id: 1, name: tool, node_id: 'N_1', nothing: null }] };
    const fetchMock = mockFetch(jsonResponse(body));
    const result = await callTool(tool, args);
    expect(result.success, errorText(result)).toBe(true);
    expect(result.result).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init } = requestOf(fetchMock);
    expect(url.origin).toBe(API);
    expect(url.pathname).toBe(path);
    expect(queryOf(fetchMock)).toEqual(query);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('keeps `/` unescaped in query values', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ total_count: 0, incomplete_results: false, items: [] }),
    );
    await callTool('search-issues', { q: 'repo:octo-org/demo is:open' });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${API}/search/issues?q=repo%3Aocto-org/demo%20is%3Aopen`,
    );
  });

  it('search-issues leaves out `sort` for best-match', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ total_count: 0, incomplete_results: false, items: [] }),
    );
    await callTool('search-issues', { q: 'is:open', sort: 'best-match' });
    expect(queryOf(fetchMock)).toEqual({ q: 'is:open' });
  });

  it('search-issues rejects an empty query before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('search-issues', { q: '  ' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('`q` must be a non-empty search query.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('compare-commits rejects a `basehead` that is not BASE...HEAD before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('compare-commits', { ...REPO, basehead: 'main..feature' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('`basehead` must match `BASE...HEAD`.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('get-file-content encodes each path segment and adds the decoded content', async () => {
    const text = '# Título\n\nHello.\n';
    const body = {
      type: 'file',
      encoding: 'base64',
      size: Buffer.byteLength(text),
      name: 'My File.md',
      path: 'docs/My File.md',
      // The API wraps base64 content in lines.
      content: `${Buffer.from(text).toString('base64')}\n`,
      sha: '3d21ec53a331a6f037a91c368710b99387d012c1',
      html_url: 'https://github.com/octo-org/demo/blob/main/docs/My%20File.md',
    };
    const fetchMock = mockFetch(jsonResponse(body));
    const result = await callTool('get-file-content', {
      ...REPO,
      path: 'docs/My File.md',
      ref: 'main',
    });
    expect(result.success).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${API}${R}/contents/docs/My%20File.md?ref=main`,
    );
    expect(result.result).toEqual({ ...body, decoded_content: text });
  });

  it('get-file-content returns a directory listing untouched', async () => {
    const listing = [{ type: 'file', name: 'a.md', path: 'docs/a.md', sha: 'abc', size: 1 }];
    mockFetch(jsonResponse(listing));
    const result = await callTool('get-file-content', { ...REPO, path: 'docs' });
    expect(result.result).toEqual(listing);
  });

  it('list-repos reads every installation and returns curated repositories', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        total_count: 2,
        installations: [
          { id: 101, account: { login: 'octo-org', type: 'Organization' } },
          { id: 102, account: { login: 'octo-test', type: 'User' } },
        ],
      }),
      jsonResponse({ total_count: 1, repositories: [repoBody(11, 'octo-org/demo', true)] }),
      jsonResponse({ total_count: 1, repositories: [repoBody(21, 'octo-test/notes')] }),
    );
    const result = await callTool('list-repos', { per_page: 50, page: 1 });
    expect(result.success, errorText(result)).toBe(true);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      `${API}/user/installations?per_page=100`,
      `${API}/user/installations/101/repositories?per_page=50&page=1`,
      `${API}/user/installations/102/repositories?per_page=50&page=1`,
    ]);
    const out = result.result as { total_count: number; repositories: Record<string, unknown>[] };
    expect(out.total_count).toBe(2);
    expect(out.repositories[0]).toEqual({
      id: 11,
      name: 'demo',
      full_name: 'octo-org/demo',
      private: true,
      visibility: 'private',
      description: null,
      default_branch: 'main',
      language: 'TypeScript',
      stargazers_count: 3,
      forks_count: 0,
      open_issues_count: 2,
      archived: false,
      fork: false,
      pushed_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-02T10:00:00Z',
      html_url: 'https://github.com/octo-org/demo',
      owner: { login: 'octo-org', avatar_url: 'https://avatars.example.com/u/12' },
    });
    expect(out.repositories.map((r) => r.full_name)).toEqual(['octo-org/demo', 'octo-test/notes']);
  });

  it('list-repos filters by owner without regard to case', async () => {
    mockFetch(
      jsonResponse({ total_count: 1, installations: [{ id: 101 }] }),
      jsonResponse({
        total_count: 2,
        repositories: [repoBody(11, 'octo-org/demo'), repoBody(21, 'octo-test/notes')],
      }),
    );
    const result = await callTool('list-repos', { owner: 'OCTO-TEST' });
    const out = result.result as { total_count: number; repositories: Record<string, unknown>[] };
    expect(out.total_count).toBe(1);
    expect(out.repositories.map((r) => r.full_name)).toEqual(['octo-test/notes']);
  });

  it('list-repos returns an empty list after one request when the user has no installation', async () => {
    const fetchMock = mockFetch(jsonResponse({ total_count: 0, installations: [] }));
    const result = await callTool('list-repos', {});
    expect(result.result).toEqual({ total_count: 0, repositories: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'get-installation-context',
    'get-user',
  ])('%s lists installations with their repositories and manage URL', async (tool) => {
    const fetchMock = mockFetch(
      jsonResponse({
        total_count: 1,
        installations: [
          {
            id: 101,
            account: { login: 'octo-org', type: 'Organization' },
            repository_selection: 'selected',
            permissions: { contents: 'write', metadata: 'read' },
            app_slug: 'agentapps-test',
          },
        ],
      }),
      jsonResponse({ total_count: 1, repositories: [repoBody(11, 'octo-org/demo', true)] }),
    );
    const result = await callTool(tool, {});
    expect(result.success, errorText(result)).toBe(true);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      `${API}/user/installations?per_page=100`,
      `${API}/user/installations/101/repositories?per_page=100`,
    ]);
    expect(result.result).toEqual({
      app: { name: 'GitHub App', slug: 'agentapps-test' },
      installations: [
        {
          id: 101,
          account: 'octo-org',
          account_type: 'Organization',
          repository_selection: 'selected',
          permissions: { contents: 'write', metadata: 'read' },
          repository_count: 1,
          repositories: [{ full_name: 'octo-org/demo', private: true }],
          manage_url: 'https://github.com/settings/installations/101',
        },
      ],
      install_url: 'https://github.com/apps/agentapps-test/installations/new',
    });
  });

  it('get-installation-context returns the install URL when there is no installation', async () => {
    mockFetch(jsonResponse({ total_count: 0, installations: [] }));
    const result = await callTool('get-installation-context', {});
    expect(result.result).toEqual({
      app: { name: 'GitHub App', slug: 'agentapps-test' },
      installations: [],
      install_url: 'https://github.com/apps/agentapps-test/installations/new',
    });
  });
});

describe('write tools: issues', () => {
  it('create-issue posts the issue', async () => {
    const created = {
      id: 1,
      number: 7,
      title: 'Bug',
      state: 'open',
      html_url: 'https://github.com/octo-org/demo/issues/7',
    };
    const fetchMock = mockFetch(jsonResponse(created, 201));
    const result = await callTool('create-issue', {
      ...REPO,
      title: 'Bug',
      body: 'It **breaks**.',
      labels: ['bug'],
      assignees: ['octo-test'],
    });
    expect(result.success, errorText(result)).toBe(true);
    expect(result.result).toEqual(created);
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/issues`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({
      title: 'Bug',
      body: 'It **breaks**.',
      labels: ['bug'],
      assignees: ['octo-test'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('update-issue patches only the fields it was given', async () => {
    const fetchMock = mockFetch(jsonResponse({ number: 7, state: 'closed' }));
    const result = await callTool('update-issue', {
      ...REPO,
      issue_number: 7,
      state: 'closed',
      state_reason: 'not_planned',
      labels: [],
    });
    expect(result.success, errorText(result)).toBe(true);
    expect(result.result).toEqual({ number: 7, state: 'closed' });
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/issues/7`);
    expect(init.method).toBe('PATCH');
    expect(bodyOf(fetchMock)).toEqual({ state: 'closed', state_reason: 'not_planned', labels: [] });
  });

  it('add-issue-comment posts the comment', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 55, body: 'Thanks' }, 201));
    const result = await callTool('add-issue-comment', {
      ...REPO,
      issue_number: 7,
      body: 'Thanks',
    });
    expect(result.result).toEqual({ id: 55, body: 'Thanks' });
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/issues/7/comments`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({ body: 'Thanks' });
  });

  it('add-labels-to-issue posts the labels and returns the label set', async () => {
    const labels = [{ id: 1, name: 'bug', color: 'd73a4a', default: true, description: null }];
    const fetchMock = mockFetch(jsonResponse(labels));
    const result = await callTool('add-labels-to-issue', {
      ...REPO,
      issue_number: 7,
      labels: ['bug'],
    });
    expect(result.result).toEqual(labels);
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/issues/7/labels`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({ labels: ['bug'] });
  });

  it.each([
    [[], '`labels` must be a non-empty array of label names.'],
    [['bug', ' '], 'Each entry in `labels` must be a non-empty string.'],
  ])('add-labels-to-issue rejects labels %j before any request', async (labels, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('add-labels-to-issue', { ...REPO, issue_number: 7, labels });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('write tools: pull requests', () => {
  it('create-pull posts the pull request, not a draft by default', async () => {
    const fetchMock = mockFetch(jsonResponse({ number: 12, draft: false, state: 'open' }, 201));
    const result = await callTool('create-pull', {
      ...REPO,
      title: 'Add tests',
      body: 'Details',
      head: 'feature/tests',
      base: 'main',
    });
    expect(result.result).toEqual({ number: 12, draft: false, state: 'open' });
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/pulls`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({
      title: 'Add tests',
      body: 'Details',
      head: 'feature/tests',
      base: 'main',
      draft: false,
    });
  });

  it('merge-pull puts the merge with the `merge` method by default', async () => {
    const merged = {
      sha: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
      merged: true,
      message: 'Pull Request successfully merged',
    };
    const fetchMock = mockFetch(jsonResponse(merged));
    const result = await callTool('merge-pull', { ...REPO, pull_number: 12 });
    expect(result.result).toEqual(merged);
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/pulls/12/merge`);
    expect(init.method).toBe('PUT');
    expect(bodyOf(fetchMock)).toEqual({ merge_method: 'merge' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('merge-pull sends the method, title and message it was given', async () => {
    const fetchMock = mockFetch(jsonResponse({ sha: 'abc', merged: true, message: 'ok' }));
    await callTool('merge-pull', {
      ...REPO,
      pull_number: 12,
      merge_method: 'squash',
      commit_title: 'feat: tests (#12)',
      commit_message: 'Body',
    });
    expect(bodyOf(fetchMock)).toEqual({
      commit_title: 'feat: tests (#12)',
      commit_message: 'Body',
      merge_method: 'squash',
    });
  });

  it("merge-pull returns the API's message when the pull request cannot be merged", async () => {
    const fetchMock = mockFetch(githubError(405, 'Pull Request is not mergeable'));
    const result = await callTool('merge-pull', { ...REPO, pull_number: 12 });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Pull Request is not mergeable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('request-reviewers posts users and teams', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ number: 12, requested_reviewers: [{ login: 'hubot' }] }, 201),
    );
    const result = await callTool('request-reviewers', {
      ...REPO,
      pull_number: 12,
      reviewers: ['hubot'],
      team_reviewers: ['core'],
    });
    expect(result.success, errorText(result)).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/pulls/12/requested_reviewers`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({ reviewers: ['hubot'], team_reviewers: ['core'] });
  });

  it('request-reviewers rejects a call with no reviewer before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('request-reviewers', { ...REPO, pull_number: 12, reviewers: [] });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe(
      'At least one of `reviewers` or `team_reviewers` must contain a value.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('create-pr-review posts the review with its inline comments', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 80, state: 'CHANGES_REQUESTED' }));
    const comments = [{ path: 'src/app.ts', line: 10, body: 'Rename this.' }];
    const result = await callTool('create-pr-review', {
      ...REPO,
      pull_number: 12,
      event: 'REQUEST_CHANGES',
      body: 'Please fix.',
      commit_id: 'a1b2c3d',
      comments,
    });
    expect(result.result).toEqual({ id: 80, state: 'CHANGES_REQUESTED' });
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/pulls/12/reviews`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({
      event: 'REQUEST_CHANGES',
      body: 'Please fix.',
      commit_id: 'a1b2c3d',
      comments,
    });
  });

  it('create-pr-review lets an APPROVE go without a body', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 81, state: 'APPROVED' }));
    const result = await callTool('create-pr-review', {
      ...REPO,
      pull_number: 12,
      event: 'APPROVE',
    });
    expect(result.success).toBe(true);
    expect(bodyOf(fetchMock)).toEqual({ event: 'APPROVE' });
  });

  it.each([
    'REQUEST_CHANGES',
    'COMMENT',
  ])('create-pr-review rejects %s without a body before any request', async (event) => {
    const fetchMock = mockFetch();
    const result = await callTool('create-pr-review', {
      ...REPO,
      pull_number: 12,
      event,
      body: ' ',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe(`\`body\` is required when event is ${event}.`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('write tools: repositories, branches, files, releases', () => {
  it('create-repo posts to /user/repos, public by default', async () => {
    const fetchMock = mockFetch(jsonResponse(repoBody(31, 'octo-test/new-repo'), 201));
    const result = await callTool('create-repo', {
      name: 'new-repo',
      description: 'A test',
      auto_init: true,
      gitignore_template: 'Node',
      license_template: 'mit',
    });
    expect(result.success, errorText(result)).toBe(true);
    expect((result.result as { full_name: string }).full_name).toBe('octo-test/new-repo');
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}/user/repos`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({
      name: 'new-repo',
      description: 'A test',
      private: false,
      auto_init: true,
      gitignore_template: 'Node',
      license_template: 'mit',
    });
  });

  it('create-repo posts to the organization when `org` is given', async () => {
    const fetchMock = mockFetch(jsonResponse(repoBody(32, 'octo-org/new-repo', true), 201));
    await callTool('create-repo', { name: 'new-repo', private: true, org: 'octo-org' });
    expect(requestOf(fetchMock).url.toString()).toBe(`${API}/orgs/octo-org/repos`);
    expect(bodyOf(fetchMock)).toEqual({ name: 'new-repo', private: true });
  });

  it('create-branch reads the source ref, then creates the new one from its sha', async () => {
    const sha = 'aa218f56b14c9653891f9e74264a383fa43fefbd';
    const fetchMock = mockFetch(
      jsonResponse({ ref: 'refs/heads/main', node_id: 'REF_1', object: { type: 'commit', sha } }),
      jsonResponse(
        { ref: 'refs/heads/feature/x', node_id: 'REF_2', object: { type: 'commit', sha } },
        201,
      ),
    );
    const result = await callTool('create-branch', { ...REPO, branch: 'feature/x' });
    expect(result.success, errorText(result)).toBe(true);
    expect((result.result as { ref: string }).ref).toBe('refs/heads/feature/x');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestOf(fetchMock, 0).url.toString()).toBe(`${API}${R}/git/refs/heads/main`);
    expect(requestOf(fetchMock, 0).init.method).toBe('GET');
    expect(requestOf(fetchMock, 1).url.toString()).toBe(`${API}${R}/git/refs`);
    expect(requestOf(fetchMock, 1).init.method).toBe('POST');
    expect(bodyOf(fetchMock, 1)).toEqual({ ref: 'refs/heads/feature/x', sha });
  });

  it('create-branch starts from `from_branch` and creates nothing when it does not exist', async () => {
    const fetchMock = mockFetch(githubError(404, 'Not Found'));
    const result = await callTool('create-branch', {
      ...REPO,
      branch: 'x',
      from_branch: 'develop',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Not Found');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestOf(fetchMock).url.pathname).toBe(`${R}/git/refs/heads/develop`);
  });

  it('create-or-update-file puts the content in base64, with branch and sha when given', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ content: { path: 'docs/My File.md' }, commit: { sha: 'abc' } }),
    );
    const result = await callTool('create-or-update-file', {
      ...REPO,
      path: 'docs/My File.md',
      message: 'docs: update',
      content: 'Hola, ñ\n',
      branch: 'main',
      sha: '95b966ae1c166bd92f8ae7d1c313e738c731dfc3',
    });
    expect(result.success, errorText(result)).toBe(true);
    expect(result.result).toEqual({ content: { path: 'docs/My File.md' }, commit: { sha: 'abc' } });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${API}${R}/contents/docs/My%20File.md`);
    expect(requestOf(fetchMock).init.method).toBe('PUT');
    expect(bodyOf(fetchMock)).toEqual({
      message: 'docs: update',
      content: Buffer.from('Hola, ñ\n').toString('base64'),
      branch: 'main',
      sha: '95b966ae1c166bd92f8ae7d1c313e738c731dfc3',
    });
  });

  it.each([
    ['', '`path` must be a non-empty string.'],
    ['/etc/passwd', '`path` must not start with `/`.'],
    ['docs/../../x', '`path` must not contain `..` segments.'],
  ])('create-or-update-file rejects the path %j before any request', async (path, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('create-or-update-file', {
      ...REPO,
      path,
      message: 'm',
      content: 'c',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('create-release posts the release, not a draft or prerelease by default', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 1, tag_name: 'v1.2.0', draft: false }, 201));
    const result = await callTool('create-release', {
      ...REPO,
      tag_name: 'v1.2.0',
      target_commitish: 'main',
      name: 'v1.2.0',
      body: 'Notes',
    });
    expect(result.result).toEqual({ id: 1, tag_name: 'v1.2.0', draft: false });
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/releases`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({
      tag_name: 'v1.2.0',
      target_commitish: 'main',
      name: 'v1.2.0',
      body: 'Notes',
      draft: false,
      prerelease: false,
      generate_release_notes: false,
    });
  });

  it('create-release rejects an empty tag before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('create-release', { ...REPO, tag_name: ' ' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('`tag_name` must be a non-empty string.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('write tools: actions and checks', () => {
  it('trigger-workflow posts the dispatch and reports success on the 204', async () => {
    const fetchMock = mockFetch(noContent());
    const result = await callTool('trigger-workflow', {
      ...REPO,
      workflow_id: 'deploy.yml',
      ref: 'main',
      inputs: { environment: 'staging' },
    });
    expect(result.result).toEqual({ success: true, message: 'Workflow triggered successfully' });
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/actions/workflows/deploy.yml/dispatches`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({ ref: 'main', inputs: { environment: 'staging' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('trigger-workflow sends empty inputs when none are given', async () => {
    const fetchMock = mockFetch(noContent());
    await callTool('trigger-workflow', { ...REPO, workflow_id: 'ci.yml', ref: 'main' });
    expect(bodyOf(fetchMock)).toEqual({ ref: 'main', inputs: {} });
  });

  it('rerun-workflow-run re-runs only the failed jobs by default', async () => {
    const fetchMock = mockFetch(jsonResponse({}, 201));
    const result = await callTool('rerun-workflow-run', { ...REPO, run_id: 9001 });
    expect(result.result).toEqual({});
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/actions/runs/9001/rerun-failed-jobs`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({ enable_debug_logging: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rerun-workflow-run re-runs every job with mode "all"', async () => {
    const fetchMock = mockFetch(jsonResponse({}, 201));
    await callTool('rerun-workflow-run', {
      ...REPO,
      run_id: 9001,
      mode: 'all',
      enable_debug_logging: true,
    });
    expect(requestOf(fetchMock).url.toString()).toBe(`${API}${R}/actions/runs/9001/rerun`);
    expect(bodyOf(fetchMock)).toEqual({ enable_debug_logging: true });
  });

  it('cancel-workflow-run posts the cancel with no body', async () => {
    const fetchMock = mockFetch(jsonResponse({}, 202));
    const result = await callTool('cancel-workflow-run', { ...REPO, run_id: 9001 });
    expect(result.result).toEqual({});
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/actions/runs/9001/cancel`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('dispatch-event posts the repository_dispatch and reports success on the 204', async () => {
    const fetchMock = mockFetch(noContent());
    const result = await callTool('dispatch-event', {
      ...REPO,
      event_type: 'deploy',
      client_payload: { version: '1.2.0', dry_run: true },
    });
    expect(result.result).toEqual({ success: true });
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/dispatches`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({
      event_type: 'deploy',
      client_payload: { version: '1.2.0', dry_run: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dispatch-event rejects an empty event type before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('dispatch-event', { ...REPO, event_type: '' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('`event_type` must be a non-empty string.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('create-check-run posts the check, queued by default', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 4, status: 'queued' }, 201));
    const result = await callTool('create-check-run', {
      ...REPO,
      name: 'lint',
      head_sha: 'ce587453ced02b1526dfb4cb910479d431683101',
      details_url: 'https://ci.example.com/1',
      external_id: 'run-1',
    });
    expect(result.result).toEqual({ id: 4, status: 'queued' });
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/check-runs`);
    expect(init.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({
      name: 'lint',
      head_sha: 'ce587453ced02b1526dfb4cb910479d431683101',
      status: 'queued',
      details_url: 'https://ci.example.com/1',
      external_id: 'run-1',
    });
  });

  it.each([
    [{ name: ' ', head_sha: 'abc' }, '`name` must be a non-empty string.'],
    [{ name: 'lint', head_sha: '' }, '`head_sha` must be a non-empty SHA.'],
    [
      { name: 'lint', head_sha: 'abc', status: 'completed' },
      '`conclusion` is required when status is `completed`.',
    ],
  ])('create-check-run rejects %j before any request', async (args, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('create-check-run', { ...REPO, ...args });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('update-check-run patches only the fields it was given', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ id: 4, status: 'completed', conclusion: 'success' }),
    );
    const output = { title: 'Lint', summary: 'No problems' };
    const result = await callTool('update-check-run', {
      ...REPO,
      check_run_id: 4,
      status: 'completed',
      conclusion: 'success',
      output,
    });
    expect(result.result).toEqual({ id: 4, status: 'completed', conclusion: 'success' });
    const { url, init } = requestOf(fetchMock);
    expect(url.toString()).toBe(`${API}${R}/check-runs/4`);
    expect(init.method).toBe('PATCH');
    expect(bodyOf(fetchMock)).toEqual({ status: 'completed', conclusion: 'success', output });
  });

  it('update-check-run rejects `completed` without a conclusion before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('update-check-run', {
      ...REPO,
      check_run_id: 4,
      status: 'completed',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('`conclusion` is required when status is `completed`.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
