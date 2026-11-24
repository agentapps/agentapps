/**
 * Tool and health tests for the Linear Agent App. The Linear GraphQL API is mocked
 * (fetch, see harness.ts): no real request, no real key.
 *
 * The app goes through `@linear/sdk`, so one tool call is often several GraphQL
 * documents: the SDK returns relations (state, assignee, team, labels) as lazy
 * getters that each send their own query. The tests assert the operations that leave,
 * with their variables, and the shape the tool returns.
 *
 * Mock nodes carry the fields the SDK models read (`reactions`, `state { id }`,
 * `team { id }`, a project's `status`), with synthetic values.
 */

import { describe, expect, it } from 'vitest';
import {
  calls,
  callsOf,
  callTool,
  graphqlError,
  installationSecrets,
  type Message,
  mockGraphQL,
  mockNetworkFailure,
  runHealthCheck,
} from './harness.js';

const API_URL = 'https://api.linear.app/graphql';
const FAKE_KEY = 'lin_api_fake_key_for_tests';

const ISSUE_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const ISSUE_2_ID = 'a1b2c3d4-0000-4000-8000-000000000002';
const PARENT_ID = 'a1b2c3d4-0000-4000-8000-000000000009';
const TEAM_ID = 'b1b2c3d4-0000-4000-8000-000000000001';
const USER_ID = 'c1b2c3d4-0000-4000-8000-000000000001';
const STATE_ID = 'd1b2c3d4-0000-4000-8000-000000000001';
const PROJECT_ID = 'e1b2c3d4-0000-4000-8000-000000000001';
const LABEL_BUG = 'f1b2c3d4-0000-4000-8000-000000000001';
const LABEL_UI = 'f1b2c3d4-0000-4000-8000-000000000002';
const LABEL_NEW = 'f1b2c3d4-0000-4000-8000-000000000003';
const COMMENT_ID = '01b2c3d4-0000-4000-8000-000000000001';

const CREATED = '2026-03-02T09:15:00.000Z';
const UPDATED = '2026-03-05T16:40:12.000Z';

const pageInfo = (hasNextPage = false, endCursor: string | null = null) => ({
  hasNextPage,
  hasPreviousPage: false,
  startCursor: null,
  endCursor,
});
const connection = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) => ({
  nodes,
  pageInfo: pageInfo(hasNextPage, endCursor),
});

function issueNode(over: Record<string, unknown> = {}) {
  return {
    __typename: 'Issue',
    id: ISSUE_ID,
    identifier: 'ENG-42',
    number: 42,
    title: 'Login button does nothing on Safari',
    description: 'Steps:\n1. Open the login page\n2. Click **Log in**',
    url: 'https://linear.app/example/issue/ENG-42/login-button-does-nothing-on-safari',
    priority: 2,
    priorityLabel: 'High',
    estimate: null,
    dueDate: null,
    archivedAt: null,
    createdAt: CREATED,
    updatedAt: UPDATED,
    reactions: [],
    labelIds: [LABEL_BUG],
    state: { id: STATE_ID },
    team: { id: TEAM_ID },
    assignee: { id: USER_ID },
    creator: { id: USER_ID },
    project: null,
    cycle: null,
    parent: null,
    ...over,
  };
}

const stateNode = {
  __typename: 'WorkflowState',
  id: STATE_ID,
  name: 'In Progress',
  type: 'started',
  color: '#f2c94c',
  position: 2,
  description: null,
  createdAt: CREATED,
  updatedAt: UPDATED,
  team: { id: TEAM_ID },
};

const teamNode = {
  __typename: 'Team',
  id: TEAM_ID,
  name: 'Engineering',
  key: 'ENG',
  icon: null,
  color: '#5e6ad2',
  description: null,
  private: false,
  createdAt: CREATED,
  updatedAt: UPDATED,
};

const userNode = {
  __typename: 'User',
  id: USER_ID,
  name: 'Ada Example',
  displayName: 'ada',
  email: 'ada@example.com',
  avatarUrl: null,
  active: true,
  admin: false,
  createdAt: CREATED,
  updatedAt: UPDATED,
};

function labelNode(id: string, name: string, over: Record<string, unknown> = {}) {
  return {
    __typename: 'IssueLabel',
    id,
    name,
    color: '#eb5757',
    description: null,
    isGroup: false,
    parent: null,
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...over,
  };
}

const projectNode = {
  __typename: 'Project',
  id: PROJECT_ID,
  name: 'Q2 Login Revamp',
  description: 'Rework the login flow',
  url: 'https://linear.app/example/project/q2-login-revamp-0123456789ab',
  state: 'started',
  icon: null,
  color: '#bec2c8',
  progress: 0.25,
  startDate: '2026-04-01',
  targetDate: '2026-06-30',
  createdAt: CREATED,
  updatedAt: UPDATED,
  status: { id: 'status-1', name: 'In Progress', type: 'started', color: '#f2c94c' },
  lead: { id: USER_ID },
};

const commentNode = {
  __typename: 'Comment',
  id: COMMENT_ID,
  body: 'Reproduced on Safari 17.',
  url: `https://linear.app/example/issue/ENG-42#comment-${COMMENT_ID.slice(0, 8)}`,
  createdAt: CREATED,
  updatedAt: CREATED,
  reactions: [],
  user: { id: USER_ID },
  issue: { id: ISSUE_ID },
};

/** Answers for the relation queries the SDK sends when the app shapes an issue. */
const issueRelations = {
  workflowState: { workflowState: stateNode },
  team: { team: teamNode },
  user: { user: userNode },
  issue_labels: { issue: { labels: connection([labelNode(LABEL_BUG, 'Bug')]) } },
};

const mutationOk = (extra: Record<string, unknown> = {}) => ({
  success: true,
  lastSyncId: 1234,
  ...extra,
});

const resultOf = (msg: Message) => msg.result as Record<string, any>;
const errorOf = (msg: Message) => msg.error as { code: string; message: string };
const operations = () => calls.map((c) => c.operation);

function expectOk(msg: Message): Record<string, any> {
  expect(msg.success, JSON.stringify(msg.error)).toBe(true);
  return resultOf(msg);
}

describe('health', () => {
  it('is ready when the key can list a team, and sends the key as the Authorization header', async () => {
    mockGraphQL({ teams: { teams: connection([teamNode]) } });
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(health.message).toBe('Linear connected');
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe(API_URL);
    expect(call.method).toBe('POST');
    expect(call.operation).toBe('teams');
    expect(call.variables).toEqual({ first: 1 });
    // A personal API key goes as is, without a "Bearer" prefix.
    expect(call.headers.authorization).toBe(FAKE_KEY);
  });

  it('is not_ready without API_KEY, and sends nothing', async () => {
    delete installationSecrets.API_KEY;
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('Linear API key not configured');
    expect((health.issues as { code: string }[])[0].code).toBe('USER_NOT_AUTHENTICATED');
    expect(calls).toHaveLength(0);
  });

  it('is degraded when Linear cannot be reached', async () => {
    mockNetworkFailure('fetch failed');
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(String(health.message)).toMatch(/^Linear API error: /);
    expect((health.issues as { code: string }[])[0].code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(JSON.stringify(health)).not.toContain(FAKE_KEY);
  });

  it('is degraded on a server error', async () => {
    mockGraphQL({ teams: graphqlError(503, 'Service unavailable', 'internal error') });
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    // The health check is one request: it is not retried.
    expect(calls).toHaveLength(1);
  });

  it('is not_ready with AUTH_INVALID on a 401 that carries no GraphQL error', async () => {
    // The SDK then names the status in its message ("GraphQL Error (Code: 401)"),
    // which is what the health check looks for.
    mockGraphQL({ teams: new Response('Unauthorized', { status: 401 }) });
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('Linear API key is invalid');
    expect((health.issues as { code: string }[])[0].code).toBe('AUTH_INVALID');
  });

  // BUG (src/app.ts:50): the invalid-key branch tests the error message for
  // /401|403|unauthori[sz]ed/. When the rejection is a GraphQL error (the body Linear
  // sends for a bad key: "Authentication required, not authenticated", type
  // "authentication error"), @linear/sdk uses that text as the message and none of the
  // three patterns is in it, so the health check answers `degraded` with
  // DEPENDENCY_UNAVAILABLE instead of `not_ready` with AUTH_INVALID.
  it.todo(
    'is not_ready with AUTH_INVALID when Linear rejects the key with a GraphQL authentication error',
  );
});

describe('issues', () => {
  it('list-issues sends the filters and page size, and returns compact rows', async () => {
    mockGraphQL({
      issues: { issues: connection([issueNode()], true, 'cursor-page-2') },
      ...issueRelations,
    });
    const result = expectOk(
      await callTool('list-issues', {
        teamId: TEAM_ID,
        assigneeId: USER_ID,
        status: 'started',
        priority: 'high',
        limit: 10,
        startCursor: 'cursor-page-1',
      }),
    );

    const [list] = callsOf('issues');
    expect(list.url).toBe(API_URL);
    expect(list.method).toBe('POST');
    expect(list.kind).toBe('query');
    expect(list.headers.authorization).toBe(FAKE_KEY);
    expect(list.variables).toEqual({
      filter: {
        team: { id: { eq: TEAM_ID } },
        assignee: { id: { eq: USER_ID } },
        state: { type: { eq: 'started' } },
        priority: { eq: 2 },
      },
      first: 10,
      after: 'cursor-page-1',
    });
    // The list shape resolves state, assignee and team for each row: three more queries.
    expect(operations().sort()).toEqual(['issues', 'team', 'user', 'workflowState']);
    expect(callsOf('workflowState')[0].variables).toEqual({ id: STATE_ID });
    expect(callsOf('user')[0].variables).toEqual({ id: USER_ID });
    expect(callsOf('team')[0].variables).toEqual({ id: TEAM_ID });

    expect(result).toEqual({
      issues: [
        {
          id: ISSUE_ID,
          identifier: 'ENG-42',
          title: 'Login button does nothing on Safari',
          url: 'https://linear.app/example/issue/ENG-42/login-button-does-nothing-on-safari',
          status: 'In Progress',
          priority: { number: 2, name: 'high' },
          assignee: {
            id: USER_ID,
            name: 'Ada Example',
            displayName: 'ada',
            email: 'ada@example.com',
            avatarUrl: null,
            active: true,
            admin: false,
          },
          team: {
            id: TEAM_ID,
            name: 'Engineering',
            key: 'ENG',
            icon: null,
            color: '#5e6ad2',
            description: null,
            private: false,
          },
          createdAt: CREATED,
          updatedAt: UPDATED,
        },
      ],
      total: 1,
      hasMore: true,
      nextCursor: 'cursor-page-2',
    });
  });

  it('list-issues sends no filter by default and keeps the page size between 1 and 100', async () => {
    mockGraphQL({ issues: { issues: connection([]) } });
    const empty = expectOk(await callTool('list-issues', {}));
    expect(empty).toEqual({ issues: [], total: 0, hasMore: false, nextCursor: null });
    expectOk(await callTool('list-issues', { limit: 500 }));
    expectOk(await callTool('list-issues', { limit: 0 }));
    expect(callsOf('issues').map((c) => c.variables)).toEqual([
      { first: 50 },
      { first: 100 },
      { first: 1 },
    ]);
  });

  it('list-issues handles an unassigned issue without asking for a user', async () => {
    mockGraphQL({
      issues: { issues: connection([issueNode({ assignee: null })]) },
      workflowState: issueRelations.workflowState,
      team: issueRelations.team,
    });
    const result = expectOk(await callTool('list-issues', { fields: ['identifier', 'assignee'] }));
    expect(result.issues).toEqual([{ identifier: 'ENG-42', assignee: null }]);
    expect(callsOf('user')).toHaveLength(0);
  });

  it('list-issues rejects a teamId that is not a UUID before any request', async () => {
    const msg = await callTool('list-issues', { teamId: 'ENG' });
    expect(msg.success).toBe(false);
    expect(errorOf(msg).message).toBe('Invalid teamId: expected UUID, got "ENG"');
    expect(calls).toHaveLength(0);
  });

  it('get-issue reads by identifier and returns the detail shape with labels', async () => {
    mockGraphQL({ issue: { issue: issueNode() }, ...issueRelations });
    const result = expectOk(await callTool('get-issue', { issueId: 'ENG-42' }));

    expect(callsOf('issue')[0].variables).toEqual({ id: 'ENG-42' });
    expect(callsOf('issue_labels')[0].variables).toEqual({ id: ISSUE_ID });
    expect(result).toMatchObject({
      id: ISSUE_ID,
      identifier: 'ENG-42',
      status: 'In Progress',
      priority: { number: 2, name: 'high' },
      labels: ['Bug'],
      description: 'Steps:\n1. Open the login page\n2. Click **Log in**',
      project: null,
      cycle: null,
      parentId: null,
      dueDate: null,
      estimate: null,
      archivedAt: null,
    });
    expect(result.assignee.email).toBe('ada@example.com');
    expect(result.team.key).toBe('ENG');
    // `creator` is resolved but is not part of the default field list.
    expect(result).not.toHaveProperty('creator');
  });

  it('get-issue returns only the fields asked for', async () => {
    mockGraphQL({ issue: { issue: issueNode() }, ...issueRelations });
    const result = expectOk(
      await callTool('get-issue', { issueId: ISSUE_ID, fields: ['identifier', 'title'] }),
    );
    expect(result).toEqual({
      identifier: 'ENG-42',
      title: 'Login button does nothing on Safari',
    });
  });

  it('get-issue rejects a malformed or missing issueId before any request', async () => {
    const bad = await callTool('get-issue', { issueId: 'not an id' });
    expect(bad.success).toBe(false);
    expect(errorOf(bad).message).toContain('Invalid issueId: expected UUID or identifier');
    const missing = await callTool('get-issue', {});
    expect(missing.success).toBe(false);
    expect(errorOf(missing).message).toContain('Invalid issueId');
    expect(calls).toHaveLength(0);
  });

  it('create-issue sends the input with a numeric priority and resolves a parent identifier', async () => {
    const created = issueNode({ id: ISSUE_2_ID, identifier: 'ENG-43', title: 'Add SSO' });
    mockGraphQL({
      issue: (variables) => ({
        issue:
          variables.id === 'ENG-7' ? issueNode({ id: PARENT_ID, identifier: 'ENG-7' }) : created,
      }),
      createIssue: { issueCreate: mutationOk({ issue: { id: ISSUE_2_ID } }) },
      ...issueRelations,
    });
    const result = expectOk(
      await callTool('create-issue', {
        title: 'Add SSO',
        teamId: TEAM_ID,
        description: 'Okta first',
        priority: 'urgent',
        labelIds: [LABEL_BUG],
        parentId: 'ENG-7',
        // Empty strings from a caller are treated as absent.
        assigneeId: '',
        projectId: '  ',
        stateId: '',
      }),
    );

    // The parent identifier is looked up first, then the mutation carries its UUID.
    expect(calls[0].operation).toBe('issue');
    expect(calls[0].variables).toEqual({ id: 'ENG-7' });
    const [mutation] = callsOf('createIssue');
    expect(mutation.kind).toBe('mutation');
    expect(mutation.url).toBe(API_URL);
    expect(mutation.variables).toEqual({
      input: {
        title: 'Add SSO',
        teamId: TEAM_ID,
        description: 'Okta first',
        labelIds: [LABEL_BUG],
        parentId: PARENT_ID,
        priority: 1,
      },
    });
    // The created issue is read back by the id the mutation returned.
    expect(callsOf('issue')[1].variables).toEqual({ id: ISSUE_2_ID });
    expect(result).toMatchObject({
      id: ISSUE_2_ID,
      identifier: 'ENG-43',
      title: 'Add SSO',
      status: 'In Progress',
    });
    expect(Object.keys(result).sort()).toEqual([
      'assignee',
      'createdAt',
      'id',
      'identifier',
      'priority',
      'status',
      'team',
      'title',
      'updatedAt',
      'url',
    ]);
  });

  it('create-issue rejects bad ids before any request', async () => {
    const team = await callTool('create-issue', { title: 'x', teamId: 'ENG' });
    expect(errorOf(team).message).toBe('Invalid teamId: expected UUID, got "ENG"');
    const assignee = await callTool('create-issue', {
      title: 'x',
      teamId: TEAM_ID,
      assigneeId: 'ada',
    });
    expect(errorOf(assignee).message).toBe('Invalid assigneeId: expected UUID, got "ada"');
    const parent = await callTool('create-issue', { title: 'x', teamId: TEAM_ID, parentId: 'x y' });
    expect(errorOf(parent).message).toContain('Invalid parentId');
    expect(calls).toHaveLength(0);
  });

  it('create-issue is not retried when Linear answers 500', async () => {
    mockGraphQL({ createIssue: graphqlError(500, 'Internal server error', 'internal error') });
    const msg = await callTool('create-issue', { title: 'x', teamId: TEAM_ID });
    expect(msg.success).toBe(false);
    expect(callsOf('createIssue')).toHaveLength(1);
  });

  it('update-issue sends only the fields given and returns the fresh issue', async () => {
    mockGraphQL({
      updateIssue: { issueUpdate: mutationOk({ issue: { id: ISSUE_ID } }) },
      issue: { issue: issueNode({ title: 'Login button is dead on Safari', priority: 4 }) },
      ...issueRelations,
    });
    const result = expectOk(
      await callTool('update-issue', {
        issueId: 'ENG-42',
        title: 'Login button is dead on Safari',
        stateId: STATE_ID,
        priority: 'low',
        estimate: 3,
        dueDate: '2026-04-01',
      }),
    );

    const [mutation] = callsOf('updateIssue');
    expect(mutation.kind).toBe('mutation');
    expect(mutation.variables).toEqual({
      id: 'ENG-42',
      input: {
        title: 'Login button is dead on Safari',
        stateId: STATE_ID,
        estimate: 3,
        dueDate: '2026-04-01',
        priority: 4,
      },
    });
    expect(operations().indexOf('updateIssue')).toBeLessThan(operations().indexOf('issue'));
    expect(result).toMatchObject({
      id: ISSUE_ID,
      title: 'Login button is dead on Safari',
      priority: { number: 4, name: 'low' },
      labels: ['Bug'],
    });
  });

  it('update-issue rejects a stateId that is not a UUID before any request', async () => {
    const msg = await callTool('update-issue', { issueId: 'ENG-42', stateId: 'Done' });
    expect(errorOf(msg).message).toBe('Invalid stateId: expected UUID, got "Done"');
    expect(calls).toHaveLength(0);
  });

  it('delete-issue sends the deleteIssue mutation', async () => {
    mockGraphQL({ deleteIssue: { issueDelete: mutationOk({ entity: { id: ISSUE_ID } }) } });
    const result = expectOk(await callTool('delete-issue', { issueId: 'ENG-42' }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: API_URL,
      method: 'POST',
      kind: 'mutation',
      operation: 'deleteIssue',
      variables: { id: 'ENG-42' },
    });
    expect(calls[0].query).toContain('issueDelete(');
    expect(result).toEqual({ success: true, issueId: 'ENG-42' });
  });

  it('delete-issue rejects a malformed id before any request', async () => {
    const msg = await callTool('delete-issue', { issueId: '42' });
    expect(msg.success).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('archive-issue sends the archiveIssue mutation', async () => {
    mockGraphQL({ archiveIssue: { issueArchive: mutationOk({ entity: { id: ISSUE_ID } }) } });
    const result = expectOk(await callTool('archive-issue', { issueId: ISSUE_ID }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      kind: 'mutation',
      operation: 'archiveIssue',
      variables: { id: ISSUE_ID },
    });
    expect(calls[0].query).toContain('issueArchive(');
    expect(result).toEqual({ success: true, issueId: ISSUE_ID });
  });

  it('add-comment resolves the issue, then creates the comment on its UUID', async () => {
    mockGraphQL({
      issue: { issue: issueNode() },
      createComment: { commentCreate: mutationOk({ comment: { id: COMMENT_ID } }) },
      comment: { comment: commentNode },
      user: issueRelations.user,
    });
    const result = expectOk(
      await callTool('add-comment', { issueId: 'ENG-42', body: 'Reproduced on Safari 17.' }),
    );

    expect(operations().slice(0, 3)).toEqual(['issue', 'createComment', 'comment']);
    expect(callsOf('createComment')[0].variables).toEqual({
      input: { issueId: ISSUE_ID, body: 'Reproduced on Safari 17.' },
    });
    expect(callsOf('comment')[0].variables).toEqual({ id: COMMENT_ID });
    expect(result).toEqual({
      id: COMMENT_ID,
      body: 'Reproduced on Safari 17.',
      authorId: USER_ID,
      authorName: 'Ada Example',
      issueId: ISSUE_ID,
      url: commentNode.url,
      createdAt: CREATED,
      updatedAt: CREATED,
    });
  });
});

describe('projects', () => {
  it('list-projects filters by team and returns compact rows', async () => {
    mockGraphQL({ projects: { projects: connection([projectNode]) } });
    const result = expectOk(await callTool('list-projects', { teamId: TEAM_ID, limit: 20 }));
    expect(calls).toHaveLength(1);
    expect(calls[0].variables).toEqual({
      filter: { accessibleTeams: { some: { id: { eq: TEAM_ID } } } },
      first: 20,
    });
    expect(result).toEqual({
      projects: [
        {
          id: PROJECT_ID,
          name: 'Q2 Login Revamp',
          url: projectNode.url,
          state: 'started',
          icon: null,
          color: '#bec2c8',
          progress: 0.25,
          startDate: '2026-04-01',
          targetDate: '2026-06-30',
          createdAt: CREATED,
          updatedAt: UPDATED,
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('create-project sends the input and reads the project back', async () => {
    mockGraphQL({
      createProject: { projectCreate: mutationOk({ project: { id: PROJECT_ID } }) },
      project: { project: projectNode },
      user: issueRelations.user,
      project_teams: { project: { teams: connection([teamNode]) } },
    });
    const result = expectOk(
      await callTool('create-project', {
        name: 'Q2 Login Revamp',
        teamIds: [TEAM_ID],
        description: 'Rework the login flow',
        leadId: USER_ID,
        startDate: '2026-04-01',
        targetDate: '2026-06-30',
      }),
    );
    const [mutation] = callsOf('createProject');
    expect(mutation.kind).toBe('mutation');
    expect(mutation.variables).toEqual({
      input: {
        name: 'Q2 Login Revamp',
        teamIds: [TEAM_ID],
        description: 'Rework the login flow',
        leadId: USER_ID,
        startDate: '2026-04-01',
        targetDate: '2026-06-30',
      },
    });
    expect(callsOf('project')[0].variables).toEqual({ id: PROJECT_ID });
    expect(result).toMatchObject({ id: PROJECT_ID, name: 'Q2 Login Revamp', state: 'started' });
    // The default field list is the compact one: lead and teams are resolved but left out.
    expect(result).not.toHaveProperty('lead');
    expect(result).not.toHaveProperty('teams');
  });

  it('create-project rejects a team id that is not a UUID before any request', async () => {
    const msg = await callTool('create-project', { name: 'x', teamIds: ['ENG'] });
    expect(errorOf(msg).message).toBe('Invalid teamIds[]: expected UUID, got "ENG"');
    expect(calls).toHaveLength(0);
  });

  it('add-issues-to-project sets projectId per issue and reports each result', async () => {
    mockGraphQL({
      updateIssue: [
        { issueUpdate: mutationOk({ issue: { id: ISSUE_ID } }) },
        graphqlError(400, 'Entity not found: Issue', 'invalid input'),
      ],
      issue: { issue: issueNode() },
    });
    const result = expectOk(
      await callTool('add-issues-to-project', {
        projectId: PROJECT_ID,
        issueIds: ['ENG-42', 'ENG-999', 'bad id'],
      }),
    );
    expect(callsOf('updateIssue').map((c) => c.variables)).toEqual([
      { id: 'ENG-42', input: { projectId: PROJECT_ID } },
      { id: 'ENG-999', input: { projectId: PROJECT_ID } },
    ]);
    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.added).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.results[0]).toEqual({ issueId: 'ENG-42', identifier: 'ENG-42', success: true });
    expect(result.results[1]).toMatchObject({ issueId: 'ENG-999', success: false });
    expect(result.results[1].error).toContain('Entity not found: Issue');
    expect(result.results[2]).toMatchObject({ issueId: 'bad id', success: false });
    expect(result.results[2].error).toContain('Invalid issueId');
  });

  it('add-issues-to-project rejects a projectId that is not a UUID before any request', async () => {
    const msg = await callTool('add-issues-to-project', { projectId: 'q2', issueIds: ['ENG-42'] });
    expect(errorOf(msg).message).toBe('Invalid projectId: expected UUID, got "q2"');
    expect(calls).toHaveLength(0);
  });

  it('remove-issues-from-project sends projectId null per issue', async () => {
    mockGraphQL({
      updateIssue: { issueUpdate: mutationOk({ issue: { id: ISSUE_ID } }) },
      issue: { issue: issueNode() },
    });
    const result = expectOk(await callTool('remove-issues-from-project', { issueIds: [ISSUE_ID] }));
    expect(callsOf('updateIssue')[0].variables).toEqual({
      id: ISSUE_ID,
      input: { projectId: null },
    });
    expect(result).toEqual({
      removed: 1,
      failed: 0,
      results: [{ issueId: ISSUE_ID, identifier: 'ENG-42', success: true }],
    });
  });
});

describe('labels', () => {
  it('list-labels lists the workspace labels', async () => {
    mockGraphQL({
      issueLabels: {
        issueLabels: connection(
          [labelNode(LABEL_BUG, 'Bug'), labelNode(LABEL_UI, 'UI')],
          true,
          'c2',
        ),
      },
    });
    const result = expectOk(await callTool('list-labels', {}));
    expect(calls).toHaveLength(1);
    expect(calls[0].variables).toEqual({ first: 50 });
    expect(result).toEqual({
      labels: [
        {
          id: LABEL_BUG,
          name: 'Bug',
          color: '#eb5757',
          description: null,
          isGroup: false,
          parentId: null,
        },
        {
          id: LABEL_UI,
          name: 'UI',
          color: '#eb5757',
          description: null,
          isGroup: false,
          parentId: null,
        },
      ],
      total: 2,
      hasMore: true,
      nextCursor: 'c2',
    });
  });

  it('list-labels with a team reads the team, then its labels', async () => {
    mockGraphQL({
      team: { team: teamNode },
      team_labels: { team: { labels: connection([labelNode(LABEL_BUG, 'Bug')]) } },
    });
    const result = expectOk(await callTool('list-labels', { teamId: TEAM_ID, limit: 5 }));
    expect(operations()).toEqual(['team', 'team_labels']);
    expect(callsOf('team_labels')[0].variables).toEqual({ id: TEAM_ID, first: 5 });
    expect(result.labels.map((l: { name: string }) => l.name)).toEqual(['Bug']);
  });

  // BUG (src/tools/_linear-helpers.ts:206, extractLabel): `l.parent` on an SDK IssueLabel
  // is a lazy getter that sends an `issueLabel` query and returns a Promise, and the model
  // has no `parentId`. So `parentId` is always null, and every child label in a list fires
  // one extra query whose result nobody awaits (a failure there is an unhandled rejection).
  it.todo('list-labels returns the parent id of a child label, without an extra request per label');

  it('create-label sends the input and reads the label back', async () => {
    mockGraphQL({
      createIssueLabel: { issueLabelCreate: mutationOk({ issueLabel: { id: LABEL_NEW } }) },
      issueLabel: { issueLabel: labelNode(LABEL_NEW, 'Regression', { color: '#FF5733' }) },
    });
    const result = expectOk(
      await callTool('create-label', {
        name: 'Regression',
        teamId: TEAM_ID,
        color: '#FF5733',
        description: 'Worked before',
      }),
    );
    const [mutation] = callsOf('createIssueLabel');
    expect(mutation.kind).toBe('mutation');
    expect(mutation.variables).toEqual({
      input: {
        name: 'Regression',
        teamId: TEAM_ID,
        color: '#FF5733',
        description: 'Worked before',
      },
    });
    expect(callsOf('issueLabel')[0].variables).toEqual({ id: LABEL_NEW });
    expect(result).toEqual({
      id: LABEL_NEW,
      name: 'Regression',
      color: '#FF5733',
      description: null,
      isGroup: false,
      parentId: null,
    });
  });

  it('create-label rejects a teamId that is not a UUID before any request', async () => {
    const msg = await callTool('create-label', { name: 'x', teamId: 'ENG' });
    expect(errorOf(msg).message).toBe('Invalid teamId: expected UUID, got "ENG"');
    expect(calls).toHaveLength(0);
  });

  it('update-label sends only the fields given and returns the fresh label', async () => {
    mockGraphQL({
      updateIssueLabel: { issueLabelUpdate: mutationOk({ issueLabel: { id: LABEL_BUG } }) },
      issueLabel: { issueLabel: labelNode(LABEL_BUG, 'Defect') },
    });
    const result = expectOk(await callTool('update-label', { labelId: LABEL_BUG, name: 'Defect' }));
    const [mutation] = callsOf('updateIssueLabel');
    expect(mutation.kind).toBe('mutation');
    expect(mutation.variables).toEqual({ id: LABEL_BUG, input: { name: 'Defect' } });
    expect(operations()).toEqual(['updateIssueLabel', 'issueLabel']);
    expect(result).toMatchObject({ id: LABEL_BUG, name: 'Defect' });
  });

  it('delete-label sends the deleteIssueLabel mutation', async () => {
    mockGraphQL({ deleteIssueLabel: { issueLabelDelete: mutationOk({ entityId: LABEL_BUG }) } });
    const result = expectOk(await callTool('delete-label', { labelId: LABEL_BUG }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: API_URL,
      method: 'POST',
      kind: 'mutation',
      operation: 'deleteIssueLabel',
      variables: { id: LABEL_BUG },
    });
    expect(calls[0].query).toContain('issueLabelDelete(');
    expect(result).toEqual({ success: true, labelId: LABEL_BUG });
  });

  it('delete-label rejects an id that is not a UUID before any request', async () => {
    const msg = await callTool('delete-label', { labelId: 'Bug' });
    expect(errorOf(msg).message).toBe('Invalid labelId: expected UUID, got "Bug"');
    expect(calls).toHaveLength(0);
  });

  it('add-labels-to-issue merges with the current labels and sends the full set', async () => {
    mockGraphQL({
      issue: { issue: issueNode() },
      issue_labels: {
        issue: { labels: connection([labelNode(LABEL_BUG, 'Bug'), labelNode(LABEL_UI, 'UI')]) },
      },
      updateIssue: { issueUpdate: mutationOk({ issue: { id: ISSUE_ID } }) },
    });
    const result = expectOk(
      await callTool('add-labels-to-issue', {
        issueId: 'ENG-42',
        labelIds: [LABEL_UI, LABEL_NEW],
      }),
    );
    expect(operations()).toEqual(['issue', 'issue_labels', 'updateIssue']);
    // The mutation goes to the issue's UUID with the whole label set, the duplicate dropped.
    expect(callsOf('updateIssue')[0].variables).toEqual({
      id: ISSUE_ID,
      input: { labelIds: [LABEL_BUG, LABEL_UI, LABEL_NEW] },
    });
    expect(result).toEqual({
      issueId: ISSUE_ID,
      identifier: 'ENG-42',
      added: 1,
      total: 3,
      labelIds: [LABEL_BUG, LABEL_UI, LABEL_NEW],
    });
  });

  it('add-labels-to-issue rejects a label id that is not a UUID before any request', async () => {
    const msg = await callTool('add-labels-to-issue', { issueId: 'ENG-42', labelIds: ['Bug'] });
    expect(errorOf(msg).message).toBe('Invalid labelIds[]: expected UUID, got "Bug"');
    expect(calls).toHaveLength(0);
  });

  it('remove-labels-from-issue sends the remaining label set', async () => {
    mockGraphQL({
      issue: { issue: issueNode() },
      issue_labels: {
        issue: { labels: connection([labelNode(LABEL_BUG, 'Bug'), labelNode(LABEL_UI, 'UI')]) },
      },
      updateIssue: { issueUpdate: mutationOk({ issue: { id: ISSUE_ID } }) },
    });
    const result = expectOk(
      await callTool('remove-labels-from-issue', {
        issueId: ISSUE_ID,
        labelIds: [LABEL_UI, LABEL_NEW],
      }),
    );
    expect(callsOf('updateIssue')[0].variables).toEqual({
      id: ISSUE_ID,
      input: { labelIds: [LABEL_BUG] },
    });
    expect(result).toEqual({
      issueId: ISSUE_ID,
      identifier: 'ENG-42',
      removed: 1,
      total: 1,
      labelIds: [LABEL_BUG],
    });
  });

  // BUG (src/tools/add-labels-to-issue.ts:37 and remove-labels-from-issue.ts:37): both read
  // only the first page of `issue.labels()` (the SDK default, 50) and then overwrite the
  // issue's label set with it, so an issue with more labels than one page loses the rest.
  it.todo('add/remove-labels keep the labels beyond the first page of issue.labels()');
});

describe('teams, users and workflow states', () => {
  it('list-teams returns the curated rows and the cursor', async () => {
    mockGraphQL({ teams: { teams: connection([teamNode], true, 'teams-cursor') } });
    const result = expectOk(await callTool('list-teams', { limit: 1 }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: API_URL, method: 'POST', operation: 'teams' });
    expect(calls[0].variables).toEqual({ first: 1 });
    expect(result).toEqual({
      teams: [
        {
          id: TEAM_ID,
          name: 'Engineering',
          key: 'ENG',
          icon: null,
          color: '#5e6ad2',
          description: null,
          private: false,
        },
      ],
      total: 1,
      hasMore: true,
      nextCursor: 'teams-cursor',
    });
  });

  it('list-teams with includeRaw returns the SDK nodes instead of the curated rows', async () => {
    mockGraphQL({ teams: { teams: connection([teamNode]) } });
    const result = expectOk(await callTool('list-teams', { includeRaw: true }));
    // In process the row is the SDK's Team model; over a real transport it is its JSON.
    const row = JSON.parse(JSON.stringify(result.teams[0]));
    expect(row).toMatchObject({ id: TEAM_ID, key: 'ENG', createdAt: CREATED });
  });

  it('list-users lists the workspace users', async () => {
    mockGraphQL({ users: { users: connection([userNode]) } });
    const result = expectOk(await callTool('list-users', { startCursor: 'u1' }));
    expect(calls).toHaveLength(1);
    expect(calls[0].variables).toEqual({ first: 50, after: 'u1' });
    expect(result).toEqual({
      users: [
        {
          id: USER_ID,
          name: 'Ada Example',
          displayName: 'ada',
          email: 'ada@example.com',
          avatarUrl: null,
          active: true,
          admin: false,
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('list-users with a team reads the team, then its members', async () => {
    mockGraphQL({
      team: { team: teamNode },
      team_members: { team: { members: connection([userNode]) } },
    });
    const result = expectOk(await callTool('list-users', { teamId: TEAM_ID }));
    expect(operations()).toEqual(['team', 'team_members']);
    expect(callsOf('team_members')[0].variables).toEqual({ id: TEAM_ID, first: 50 });
    expect(result.users).toHaveLength(1);
  });

  it('list-workflow-states reads the team, then its states', async () => {
    mockGraphQL({
      team: { team: teamNode },
      team_states: { team: { states: connection([stateNode]) } },
    });
    const result = expectOk(await callTool('list-workflow-states', { teamId: TEAM_ID }));
    expect(operations()).toEqual(['team', 'team_states']);
    expect(callsOf('team_states')[0].variables).toEqual({ id: TEAM_ID, first: 50 });
    expect(result).toEqual({
      teamId: TEAM_ID,
      states: [
        {
          id: STATE_ID,
          name: 'In Progress',
          type: 'started',
          color: '#f2c94c',
          position: 2,
          description: null,
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('list-workflow-states needs a team UUID', async () => {
    const msg = await callTool('list-workflow-states', {});
    expect(msg.success).toBe(false);
    expect(errorOf(msg).message).toContain('Invalid teamId: expected UUID');
    expect(calls).toHaveLength(0);
  });
});

describe('errors', () => {
  it('refuses every tool call while API_KEY is not set, and sends nothing', async () => {
    delete installationSecrets.API_KEY;
    for (const [tool, args] of [
      ['list-issues', {}],
      ['delete-issue', { issueId: 'ENG-42' }],
    ] as const) {
      const msg = await callTool(tool, args);
      expect(msg.success, tool).toBe(false);
      expect(errorOf(msg).message, tool).toContain('API_KEY');
    }
    expect(calls).toHaveLength(0);
  });

  it("returns Linear's error message for a rejected request, without retrying", async () => {
    mockGraphQL({
      issue: graphqlError(
        400,
        'Entity not found: Issue',
        'invalid input',
        'Could not find referenced Issue.',
      ),
    });
    const msg = await callTool('get-issue', { issueId: 'ENG-404' });
    expect(msg.success).toBe(false);
    expect(errorOf(msg).message).toBe('Entity not found: Issue - Could not find referenced Issue.');
    expect(calls).toHaveLength(1);
  });

  it('returns the authentication error for a rejected key, without the key in it', async () => {
    mockGraphQL({
      issues: graphqlError(
        401,
        'Authentication required, not authenticated',
        'authentication error',
      ),
    });
    const msg = await callTool('list-issues', {});
    expect(msg.success).toBe(false);
    expect(errorOf(msg).message).toContain('Authentication required');
    expect(JSON.stringify(msg)).not.toContain(FAKE_KEY);
    expect(calls).toHaveLength(1);
  });

  it('retries a read once Linear answers 503, and returns the second answer', async () => {
    mockGraphQL({
      teams: [
        graphqlError(503, 'Service unavailable', 'internal error'),
        { teams: connection([teamNode]) },
      ],
    });
    const result = expectOk(await callTool('list-teams', {}));
    expect(callsOf('teams')).toHaveLength(2);
    expect(result.total).toBe(1);
  });

  it('does not retry a delete when Linear answers 500', async () => {
    mockGraphQL({ deleteIssue: graphqlError(500, 'Internal server error', 'internal error') });
    const msg = await callTool('delete-issue', { issueId: 'ENG-42' });
    expect(msg.success).toBe(false);
    expect(callsOf('deleteIssue')).toHaveLength(1);
  });

  it('names the failure when Linear cannot be reached', async () => {
    mockNetworkFailure('fetch failed');
    const msg = await callTool('delete-label', { labelId: LABEL_BUG });
    expect(msg.success).toBe(false);
    expect(errorOf(msg).message).toMatch(/fetch failed/i);
  });
});
