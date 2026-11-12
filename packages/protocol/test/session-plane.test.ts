import { describe, expect, it } from 'vitest';
import {
  AuthStatusResultSchema,
  AuthUrlRequestSchema,
  CancelRequestSchema,
  CredentialsUpdatedEventSchema,
  // Supporting
  createEnvelope,
  // Helpers
  createSessionEnvelope,
  createSessionErrorResponse,
  createToolCallRequest,
  createToolResultResponse,
  EffectivePermissionsSchema,
  ErrorCode,
  GetSystemSecretsRequestSchema,
  GetUserProfileRequestSchema,
  HealthCheckRequestSchema,
  HealthStatusResponseSchema,
  HookRequestSchema,
  HookResponseSchema,
  HookVetoSchema,
  HostPushedEventSchema,
  InboundEventSchema,
  InboundSourceSchema,
  InboundSubscribeRequestSchema,
  InboundSubscribeResultSchema,
  InboundUnsubscribeRequestSchema,
  InboundUnsubscribeResultSchema,
  InstanceRequestResponseSchema,
  InstanceRequestSchema,
  IntentCallRequestSchema,
  IntentResultSchema,
  isHookRequest,
  isHookResponse,
  isInstanceRequest,
  isInstanceRequestResponse,
  isLifecycleRequest,
  isLifecycleResponse,
  isSessionEvent,
  // Type guards
  isSessionRequest,
  isSessionResponse,
  isToolCallRequest,
  isToolResultResponse,
  LifecycleEventSchema,
  LifecycleRequestSchema,
  LifecycleResponseSchema,
  ListToolsRequestSchema,
  LogEventSchema,
  OBJECT_REQUEST_TYPES,
  ObjectDeleteRequestSchema,
  ObjectDeleteResultSchema,
  ObjectGetRequestSchema,
  ObjectGetResultSchema,
  ObjectInfoSchema,
  ObjectLinkRequestSchema,
  ObjectLinkResultSchema,
  ObjectListRequestSchema,
  ObjectListResultSchema,
  ObjectPutRequestSchema,
  ObjectPutResultSchema,
  PermissionsChangedEventSchema,
  PROTOCOL_VERSION,
  SessionEventSchema,
  // Schemas
  SessionMessageBaseSchema,
  SessionRequestSchema,
  SessionResponseSchema,
  ShutdownRequestSchema,
  SubscribeRequestSchema,
  SubscriptionEventSchema,
  ToolCallRequestSchema,
  ToolProgressEventSchema,
  ToolResultResponseSchema,
  ToolStreamEventSchema,
  ToolsListResponseSchema,
  UserProfileResultSchema,
  UserProfileSchema,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = 'sess_test_001';

function sessionEnvelope(type: string) {
  return { ...createEnvelope(type, SESSION_ID) };
}

const CONTEXT = {
  userId: 'u_alice',
  workspaceId: 'w_acme',
  installationId: 'inst_gmail_42',
};

// ---------------------------------------------------------------------------
// Session-plane base
// ---------------------------------------------------------------------------

describe('SessionMessageBaseSchema', () => {
  it('requires sessionId', () => {
    const noSession = createEnvelope('tool_call');
    expect(SessionMessageBaseSchema.safeParse(noSession).success).toBe(false);
  });

  it('accepts messages with sessionId', () => {
    const withSession = createEnvelope('tool_call', SESSION_ID);
    expect(SessionMessageBaseSchema.safeParse(withSession).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Host → Instance requests
// ---------------------------------------------------------------------------

describe('session-plane requests', () => {
  it('parses a tool_call request', () => {
    const msg = {
      ...sessionEnvelope('tool_call'),
      tool: 'send-email',
      arguments: { to: 'bob@example.com', body: 'Hello' },
      context: CONTEXT,
    };
    const parsed = ToolCallRequestSchema.parse(msg);
    expect(parsed.tool).toBe('send-email');
    expect(parsed.context.installationId).toBe('inst_gmail_42');
    expect(parsed.sessionId).toBe(SESSION_ID);
  });

  it('parses a list_tools request', () => {
    const msg = sessionEnvelope('list_tools');
    expect(ListToolsRequestSchema.safeParse(msg).success).toBe(true);
  });

  it('parses a health_check request', () => {
    const msg = sessionEnvelope('health_check');
    expect(HealthCheckRequestSchema.safeParse(msg).success).toBe(true);
  });

  it('parses a shutdown request', () => {
    const msg = { ...sessionEnvelope('shutdown'), gracePeriod: 5000 };
    const parsed = ShutdownRequestSchema.parse(msg);
    expect(parsed.gracePeriod).toBe(5000);
  });

  it('parses a cancel request', () => {
    const msg = {
      ...sessionEnvelope('cancel'),
      requestId: 'req_1',
      reason: 'user pressed stop',
    };
    const parsed = CancelRequestSchema.parse(msg);
    expect(parsed.reason).toBe('user pressed stop');
  });

  it('parses a subscribe request', () => {
    const msg = {
      ...sessionEnvelope('subscribe'),
      subscription: 'board_updates',
      params: { boardId: 'b_1' },
      channelId: 'ch_1',
    };
    expect(SubscribeRequestSchema.safeParse(msg).success).toBe(true);
  });

  it('discriminated union parses all request types', () => {
    const toolCall = {
      ...sessionEnvelope('tool_call'),
      tool: 'test',
      arguments: {},
      context: CONTEXT,
    };
    const listTools = sessionEnvelope('list_tools');

    expect(SessionRequestSchema.parse(toolCall).type).toBe('tool_call');
    expect(SessionRequestSchema.parse(listTools).type).toBe('list_tools');
  });

  it('rejects requests without sessionId', () => {
    const msg = {
      ...createEnvelope('tool_call'),
      tool: 'test',
      arguments: {},
      context: CONTEXT,
    };
    // no sessionId → fails
    expect(SessionRequestSchema.safeParse(msg).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Instance → Host responses
// ---------------------------------------------------------------------------

describe('session-plane responses', () => {
  it('parses a tool_result with structuredContent', () => {
    const msg = {
      ...sessionEnvelope('tool_result'),
      success: true,
      result: 'Email sent',
      structuredContent: { id: 'msg_42', status: 'sent' },
      duration: 1234,
    };
    const parsed = ToolResultResponseSchema.parse(msg);
    expect(parsed.structuredContent).toEqual({ id: 'msg_42', status: 'sent' });
  });

  it('parses a tool_result with error', () => {
    const msg = {
      ...sessionEnvelope('tool_result'),
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token expired' },
      duration: 50,
    };
    const parsed = ToolResultResponseSchema.parse(msg);
    expect(parsed.error?.code).toBe('UNAUTHORIZED');
  });

  it('parses a tool_result with attachments', () => {
    const msg = {
      ...sessionEnvelope('tool_result'),
      success: true,
      result: 'Chart generated',
      attachments: [{ url: 'https://cdn.example/chart.png', mime: 'image/png' }],
      duration: 3000,
    };
    const parsed = ToolResultResponseSchema.parse(msg);
    expect(parsed.attachments).toHaveLength(1);
  });

  it('parses a tools_list response', () => {
    const msg = {
      ...sessionEnvelope('tools_list'),
      tools: [
        {
          name: 'list-tasks',
          description: 'List tasks',
          parameters: { type: 'object' as const, properties: {} },
          annotations: { readOnlyHint: true },
        },
      ],
    };
    const parsed = ToolsListResponseSchema.parse(msg);
    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools[0].annotations?.readOnlyHint).toBe(true);
  });

  it('parses a health_status response with issues', () => {
    const msg = {
      ...sessionEnvelope('health_status'),
      status: 'not_ready',
      message: 'OAuth token expired',
      issues: [
        {
          code: 'TOKEN_EXPIRED',
          message: 'Google OAuth token expired',
          severity: 'error' as const,
          action: {
            type: 'oauth' as const,
            url: 'https://example.com/auth',
            label: 'Re-authorize',
          },
        },
      ],
      uptime: 3600,
      version: '1.0.0',
      memoryUsage: 50_000_000,
    };
    const parsed = HealthStatusResponseSchema.parse(msg);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues?.[0].action?.type).toBe('oauth');
  });

  it('discriminated union covers all response types', () => {
    const result = {
      ...sessionEnvelope('tool_result'),
      success: true,
      duration: 0,
    };
    const error = {
      ...sessionEnvelope('error'),
      error: { code: 'TOOL_NOT_FOUND', message: 'no such tool' },
    };

    expect(SessionResponseSchema.parse(result).type).toBe('tool_result');
    expect(SessionResponseSchema.parse(error).type).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Instance → Host events
// ---------------------------------------------------------------------------

describe('session-plane events', () => {
  it('parses a log event', () => {
    const msg = {
      ...sessionEnvelope('log'),
      level: 'info',
      message: 'Tool execution started',
      data: { tool: 'send-email' },
    };
    expect(LogEventSchema.safeParse(msg).success).toBe(true);
  });

  it('parses a tool_progress event', () => {
    const msg = {
      ...sessionEnvelope('tool_progress'),
      requestId: 'req_1',
      progress: 42,
      status: 'Downloading file...',
      eta: 5000,
    };
    const parsed = ToolProgressEventSchema.parse(msg);
    expect(parsed.progress).toBe(42);
  });

  it('parses a tool_progress with null (indeterminate) progress', () => {
    const msg = {
      ...sessionEnvelope('tool_progress'),
      requestId: 'req_1',
      progress: null,
      status: 'Processing...',
    };
    const parsed = ToolProgressEventSchema.parse(msg);
    expect(parsed.progress).toBeNull();
  });

  it('parses a tool_stream event', () => {
    const msg = {
      ...sessionEnvelope('tool_stream'),
      requestId: 'req_1',
      chunk: 'partial text output',
      done: false,
    };
    const parsed = ToolStreamEventSchema.parse(msg);
    expect(parsed.done).toBe(false);
  });

  it('parses a subscription_event', () => {
    const msg = {
      ...sessionEnvelope('subscription_event'),
      subscriptionId: 'sub_1',
      event: 'board.card.moved',
      data: { cardId: 'c_1', from: 'col_a', to: 'col_b' },
    };
    expect(SubscriptionEventSchema.safeParse(msg).success).toBe(true);
  });

  it('discriminated union covers all event types', () => {
    const log = { ...sessionEnvelope('log'), level: 'warn', message: 'test' };
    const stream = {
      ...sessionEnvelope('tool_stream'),
      requestId: 'r1',
      chunk: '',
      done: true,
    };

    expect(SessionEventSchema.parse(log).type).toBe('log');
    expect(SessionEventSchema.parse(stream).type).toBe('tool_stream');
  });
});

// ---------------------------------------------------------------------------
// Host → Instance pushed events
// ---------------------------------------------------------------------------

describe('host-pushed events', () => {
  it('parses credentials_updated', () => {
    const msg = {
      ...sessionEnvelope('credentials_updated'),
      credentials: { access_token: 'new_token', refresh_token: 'new_refresh' },
    };
    const parsed = CredentialsUpdatedEventSchema.parse(msg);
    expect(parsed.credentials.access_token).toBe('new_token');
  });
});

// ---------------------------------------------------------------------------
// Instance → Host requests (REQ-7)
// ---------------------------------------------------------------------------

describe('session-plane requests', () => {
  it('parses get_system_secrets request', () => {
    const msg = {
      ...sessionEnvelope('get_system_secrets'),
      requestId: 'cb_1',
    };
    expect(GetSystemSecretsRequestSchema.safeParse(msg).success).toBe(true);
  });

  it('parses auth_url request', () => {
    const msg = {
      ...sessionEnvelope('auth_url'),
      requestId: 'cb_2',
      provider: 'google',
      scopes: ['email', 'calendar'],
    };
    const parsed = AuthUrlRequestSchema.parse(msg);
    expect(parsed.provider).toBe('google');
    expect(parsed.scopes).toHaveLength(2);
  });

  it('parses auth_status_result response', () => {
    const msg = {
      ...sessionEnvelope('auth_status_result'),
      requestId: 'cb_3',
      authenticated: true,
      provider: 'google',
      scopes: ['email'],
      expiresAt: '2026-12-31T23:59:59Z',
    };
    const parsed = AuthStatusResultSchema.parse(msg);
    expect(parsed.authenticated).toBe(true);
  });

  it('discriminated union for request requests', () => {
    const secrets = { ...sessionEnvelope('get_installation_secrets'), requestId: 'r1' };
    const auth = { ...sessionEnvelope('auth_status'), requestId: 'r2' };

    expect(InstanceRequestSchema.parse(secrets).type).toBe('get_installation_secrets');
    expect(InstanceRequestSchema.parse(auth).type).toBe('auth_status');
  });

  it('discriminated union for request responses', () => {
    const secrets = {
      ...sessionEnvelope('installation_secrets'),
      requestId: 'r1',
      secrets: { api_key: 'sk_test' },
    };
    const authUrl = {
      ...sessionEnvelope('auth_url_result'),
      requestId: 'r2',
      url: 'https://accounts.google.com/o/oauth2/auth',
      state: 'state_abc',
    };

    expect(InstanceRequestResponseSchema.parse(secrets).type).toBe('installation_secrets');
    expect(InstanceRequestResponseSchema.parse(authUrl).type).toBe('auth_url_result');
  });

  it('accepts null secrets (no credentials configured)', () => {
    const msg = {
      ...sessionEnvelope('system_secrets'),
      requestId: 'r1',
      secrets: null,
    };
    expect(InstanceRequestResponseSchema.safeParse(msg).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// User profile (R11)
// ---------------------------------------------------------------------------

describe('user profile schemas', () => {
  it('parses get_user_profile request', () => {
    const msg = {
      ...sessionEnvelope('get_user_profile'),
      requestId: 'up_1',
    };
    const parsed = GetUserProfileRequestSchema.parse(msg);
    expect(parsed.type).toBe('get_user_profile');
  });

  it('parses a full user profile', () => {
    const profile = {
      userId: 'u_alice',
      displayName: 'Alice',
      locale: 'en-US',
      timezone: 'America/New_York',
      email: 'alice@example.com',
      avatarUrl: 'https://cdn.example.com/alice.png',
    };
    const parsed = UserProfileSchema.parse(profile);
    expect(parsed.userId).toBe('u_alice');
    expect(parsed.email).toBe('alice@example.com');
  });

  it('parses a basic profile (no email/avatar)', () => {
    const profile = {
      userId: 'u_bob',
      displayName: 'Bob',
      locale: 'es-ES',
      timezone: 'Europe/Madrid',
    };
    const parsed = UserProfileSchema.parse(profile);
    expect(parsed.email).toBeUndefined();
    expect(parsed.avatarUrl).toBeUndefined();
  });

  it('parses user_profile_result with profile', () => {
    const msg = {
      ...sessionEnvelope('user_profile_result'),
      requestId: 'up_1',
      profile: { userId: 'u1', displayName: 'Test User' },
    };
    const parsed = UserProfileResultSchema.parse(msg);
    expect(parsed.profile?.userId).toBe('u1');
  });

  it('parses user_profile_result with null profile', () => {
    const msg = {
      ...sessionEnvelope('user_profile_result'),
      requestId: 'up_2',
      profile: null,
    };
    const parsed = UserProfileResultSchema.parse(msg);
    expect(parsed.profile).toBeNull();
  });

  it('get_user_profile is in InstanceRequestSchema union', () => {
    const msg = {
      ...sessionEnvelope('get_user_profile'),
      requestId: 'up_3',
    };
    const parsed = InstanceRequestSchema.parse(msg);
    expect(parsed.type).toBe('get_user_profile');
  });

  it('user_profile_result is in InstanceRequestResponseSchema union', () => {
    const msg = {
      ...sessionEnvelope('user_profile_result'),
      requestId: 'up_3',
      profile: { userId: 'u1', displayName: 'Test' },
    };
    const parsed = InstanceRequestResponseSchema.parse(msg);
    expect(parsed.type).toBe('user_profile_result');
  });
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

describe('session-plane helpers', () => {
  it('createSessionEnvelope produces a valid session envelope', () => {
    const env = createSessionEnvelope('tool_call', SESSION_ID);
    expect(env.version).toBe(PROTOCOL_VERSION);
    expect(env.sessionId).toBe(SESSION_ID);
    expect(SessionMessageBaseSchema.safeParse(env).success).toBe(true);
  });

  it('createToolCallRequest produces a parseable tool_call', () => {
    const req = createToolCallRequest(SESSION_ID, 'list-tasks', { limit: 10 }, CONTEXT);
    expect(req.type).toBe('tool_call');
    expect(req.tool).toBe('list-tasks');
    expect(req.sessionId).toBe(SESSION_ID);
    expect(ToolCallRequestSchema.safeParse(req).success).toBe(true);
  });

  it('createToolResultResponse correlates by request id', () => {
    const res = createToolResultResponse('req_42', SESSION_ID, true, 'done', undefined, 150);
    expect(res.id).toBe('req_42');
    expect(res.sessionId).toBe(SESSION_ID);
    expect(res.success).toBe(true);
    expect(res.duration).toBe(150);
    expect(ToolResultResponseSchema.safeParse(res).success).toBe(true);
  });

  it('createToolResultResponse with error', () => {
    const res = createToolResultResponse(
      'req_43',
      SESSION_ID,
      false,
      undefined,
      { code: ErrorCode.TOOL_NOT_FOUND, message: 'no such tool' },
      10,
    );
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('TOOL_NOT_FOUND');
    expect(ToolResultResponseSchema.safeParse(res).success).toBe(true);
  });

  it('createSessionErrorResponse produces a parseable error', () => {
    const err = createSessionErrorResponse(
      'req_44',
      SESSION_ID,
      ErrorCode.SESSION_NOT_FOUND,
      'session not found',
    );
    expect(err.type).toBe('error');
    expect(err.error.code).toBe('SESSION_NOT_FOUND');
    expect(SessionResponseSchema.safeParse(err).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('type guards', () => {
  it('isSessionRequest correctly identifies requests', () => {
    const req = createToolCallRequest(SESSION_ID, 'test', {}, CONTEXT);
    expect(isSessionRequest(req)).toBe(true);
    expect(isSessionResponse(req)).toBe(false);
  });

  it('isSessionResponse correctly identifies responses', () => {
    const res = createToolResultResponse('r1', SESSION_ID, true, 'ok', undefined, 0);
    expect(isSessionResponse(res)).toBe(true);
    expect(isSessionRequest(res)).toBe(false);
  });

  it('isSessionEvent correctly identifies events', () => {
    const event = {
      ...createEnvelope('tool_stream', SESSION_ID),
      requestId: 'r1',
      chunk: 'hi',
      done: false,
    };
    expect(isSessionEvent(event)).toBe(true);
  });

  it('isInstanceRequest identifies request requests', () => {
    const cb = { ...createEnvelope('get_installation_secrets', SESSION_ID), requestId: 'r1' };
    expect(isInstanceRequest(cb)).toBe(true);
    expect(isSessionRequest(cb)).toBe(false); // requests ≠ requests
  });

  it('isToolCallRequest narrows to tool_call', () => {
    const req = createToolCallRequest(SESSION_ID, 'test', {}, CONTEXT);
    expect(isToolCallRequest(req)).toBe(true);
  });

  it('isToolResultResponse narrows to tool_result', () => {
    const res = createToolResultResponse('r1', SESSION_ID, true, undefined, undefined, 0);
    expect(isToolResultResponse(res)).toBe(true);
  });

  it('rejects garbage input in all guards', () => {
    expect(isSessionRequest(null)).toBe(false);
    expect(isSessionResponse('hello')).toBe(false);
    expect(isSessionEvent(42)).toBe(false);
    expect(isInstanceRequest(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Conversation hook schemas (Phase 3)
// ---------------------------------------------------------------------------

describe('hook veto schema', () => {
  it('parses veto with reason only', () => {
    const result = HookVetoSchema.safeParse({ reason: 'Contains PII' });
    expect(result.success).toBe(true);
  });

  it('parses veto with reason and code', () => {
    const result = HookVetoSchema.safeParse({ reason: 'Contains PII', code: 'PII_DETECTED' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('PII_DETECTED');
    }
  });

  it('rejects empty reason', () => {
    const result = HookVetoSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing reason', () => {
    const result = HookVetoSchema.safeParse({ code: 'BLOCKED' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle event schema
// ---------------------------------------------------------------------------

describe('LifecycleEventSchema', () => {
  it('accepts valid lifecycle events', () => {
    expect(LifecycleEventSchema.safeParse('install').success).toBe(true);
    expect(LifecycleEventSchema.safeParse('uninstall').success).toBe(true);
    expect(LifecycleEventSchema.safeParse('upgrade').success).toBe(true);
  });

  it('rejects invalid lifecycle events', () => {
    expect(LifecycleEventSchema.safeParse('pre-message').success).toBe(false);
    expect(LifecycleEventSchema.safeParse('').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle request schema
// ---------------------------------------------------------------------------

describe('LifecycleRequestSchema', () => {
  const base = {
    ...createSessionEnvelope('lifecycle_request', 'sess_lc1'),
    event: 'install',
    context: { userId: 'u1', installationId: 'inst_1' },
  };

  it('accepts a valid install request', () => {
    expect(LifecycleRequestSchema.safeParse(base).success).toBe(true);
  });

  it('accepts an upgrade request with previousVersion', () => {
    const msg = { ...base, event: 'upgrade', previousVersion: '0.9.0' };
    expect(LifecycleRequestSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects missing event', () => {
    const { event: _, ...noEvent } = base;
    expect(LifecycleRequestSchema.safeParse(noEvent).success).toBe(false);
  });

  it('rejects missing context', () => {
    const { context: _, ...noCtx } = base;
    expect(LifecycleRequestSchema.safeParse(noCtx).success).toBe(false);
  });

  it('rejects invalid event value', () => {
    expect(LifecycleRequestSchema.safeParse({ ...base, event: 'pre-message' }).success).toBe(false);
  });

  it('is a member of SessionRequestSchema union', () => {
    expect(SessionRequestSchema.safeParse(base).success).toBe(true);
  });

  it('isLifecycleRequest type guard works', () => {
    expect(isLifecycleRequest(base)).toBe(true);
    expect(isLifecycleRequest({ type: 'tool_call' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle response schema
// ---------------------------------------------------------------------------

describe('LifecycleResponseSchema', () => {
  const base = {
    ...createSessionEnvelope('lifecycle_response', 'sess_lc1'),
    success: true,
  };

  it('accepts a success response', () => {
    expect(LifecycleResponseSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a failure response with error', () => {
    const msg = { ...base, success: false, error: 'Migration failed' };
    expect(LifecycleResponseSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects missing success field', () => {
    const { success: _, ...noSuccess } = base;
    expect(LifecycleResponseSchema.safeParse(noSuccess).success).toBe(false);
  });

  it('is a member of SessionResponseSchema union', () => {
    expect(SessionResponseSchema.safeParse(base).success).toBe(true);
  });

  it('isLifecycleResponse type guard works', () => {
    expect(isLifecycleResponse(base)).toBe(true);
    expect(isLifecycleResponse({ type: 'tool_result' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Intent call request schema
// ---------------------------------------------------------------------------

describe('IntentCallRequestSchema', () => {
  const base = {
    ...createSessionEnvelope('intent_call', 'sess_int1'),
    requestId: 'req_int_1',
    binding: 'messenger',
    tool: 'send_message',
    arguments: { to: 'alice', text: 'Hello' },
  };

  it('accepts a valid intent call', () => {
    expect(IntentCallRequestSchema.safeParse(base).success).toBe(true);
  });

  it('defaults arguments to empty object', () => {
    const { arguments: _, ...noArgs } = base;
    const result = IntentCallRequestSchema.safeParse(noArgs);
    expect(result.success).toBe(true);
  });

  it('rejects empty binding', () => {
    expect(IntentCallRequestSchema.safeParse({ ...base, binding: '' }).success).toBe(false);
  });

  it('rejects empty tool', () => {
    expect(IntentCallRequestSchema.safeParse({ ...base, tool: '' }).success).toBe(false);
  });

  it('rejects missing binding', () => {
    const { binding: _, ...noBinding } = base;
    expect(IntentCallRequestSchema.safeParse(noBinding).success).toBe(false);
  });

  it('is a member of InstanceRequestSchema union', () => {
    expect(InstanceRequestSchema.safeParse(base).success).toBe(true);
    expect(isInstanceRequest(base)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Intent result schema
// ---------------------------------------------------------------------------

describe('IntentResultSchema', () => {
  const base = {
    ...createSessionEnvelope('intent_result', 'sess_int1'),
    requestId: 'req_int_1',
    success: true,
    result: { delivered: true },
    duration: 42,
  };

  it('accepts a success result', () => {
    expect(IntentResultSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a failure result with error', () => {
    const msg = {
      ...createSessionEnvelope('intent_result', 'sess_int1'),
      requestId: 'req_int_2',
      success: false,
      error: { code: 'PERMISSION_DENIED', message: 'No binding' },
      duration: 0,
    };
    expect(IntentResultSchema.safeParse(msg).success).toBe(true);
  });

  it('defaults duration to 0', () => {
    const { duration: _, ...noDuration } = base;
    const result = IntentResultSchema.safeParse(noDuration);
    expect(result.success).toBe(true);
  });

  it('rejects missing success', () => {
    const { success: _, ...noSuccess } = base;
    expect(IntentResultSchema.safeParse(noSuccess).success).toBe(false);
  });

  it('is a member of InstanceRequestResponseSchema union', () => {
    expect(InstanceRequestResponseSchema.safeParse(base).success).toBe(true);
    expect(isInstanceRequestResponse(base)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Inbound event subscriptions (R6 inbound — 4.7, 4.8)
// ---------------------------------------------------------------------------

describe('InboundSourceSchema', () => {
  it('accepts binding source', () => {
    const result = InboundSourceSchema.safeParse({ kind: 'binding', binding: 'messenger' });
    expect(result.success).toBe(true);
  });

  it('accepts platform source', () => {
    const result = InboundSourceSchema.safeParse({ kind: 'platform', namespace: 'boards' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown kind', () => {
    expect(InboundSourceSchema.safeParse({ kind: 'unknown' }).success).toBe(false);
  });

  it('rejects binding with empty name', () => {
    expect(InboundSourceSchema.safeParse({ kind: 'binding', binding: '' }).success).toBe(false);
  });

  it('rejects platform with empty namespace', () => {
    expect(InboundSourceSchema.safeParse({ kind: 'platform', namespace: '' }).success).toBe(false);
  });
});

describe('InboundSubscribeRequestSchema', () => {
  const base = {
    ...createSessionEnvelope('inbound_subscribe', SESSION_ID),
    requestId: 'req_inb_1',
    source: { kind: 'binding', binding: 'messenger' },
    eventTypes: ['message_received'],
  };

  it('accepts a valid binding subscribe', () => {
    expect(InboundSubscribeRequestSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a platform subscribe', () => {
    const platform = {
      ...base,
      source: { kind: 'platform', namespace: 'boards' },
      eventTypes: ['task_created', '*'],
    };
    expect(InboundSubscribeRequestSchema.safeParse(platform).success).toBe(true);
  });

  it('rejects empty eventTypes', () => {
    expect(InboundSubscribeRequestSchema.safeParse({ ...base, eventTypes: [] }).success).toBe(
      false,
    );
  });

  it('is a member of InstanceRequestSchema union', () => {
    expect(InstanceRequestSchema.safeParse(base).success).toBe(true);
    expect(isInstanceRequest(base)).toBe(true);
  });
});

describe('InboundSubscribeResultSchema', () => {
  const base = {
    ...createSessionEnvelope('inbound_subscribe_result', SESSION_ID),
    requestId: 'req_inb_1',
    success: true,
    subscriptionId: 'isub_001',
  };

  it('accepts a successful result', () => {
    expect(InboundSubscribeResultSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a failure result with error', () => {
    const fail = {
      ...base,
      success: false,
      subscriptionId: undefined,
      error: { code: 'NOT_FOUND', message: 'No binding' },
    };
    expect(InboundSubscribeResultSchema.safeParse(fail).success).toBe(true);
  });

  it('is a member of InstanceRequestResponseSchema union', () => {
    expect(InstanceRequestResponseSchema.safeParse(base).success).toBe(true);
    expect(isInstanceRequestResponse(base)).toBe(true);
  });
});

describe('InboundUnsubscribeRequestSchema', () => {
  const base = {
    ...createSessionEnvelope('inbound_unsubscribe', SESSION_ID),
    requestId: 'req_unsub_1',
    subscriptionId: 'isub_001',
  };

  it('accepts a valid unsubscribe', () => {
    expect(InboundUnsubscribeRequestSchema.safeParse(base).success).toBe(true);
  });

  it('is a member of InstanceRequestSchema union', () => {
    expect(InstanceRequestSchema.safeParse(base).success).toBe(true);
  });
});

describe('InboundUnsubscribeResultSchema', () => {
  const base = {
    ...createSessionEnvelope('inbound_unsubscribe_result', SESSION_ID),
    requestId: 'req_unsub_1',
    success: true,
  };

  it('accepts a valid result', () => {
    expect(InboundUnsubscribeResultSchema.safeParse(base).success).toBe(true);
  });

  it('is a member of InstanceRequestResponseSchema union', () => {
    expect(InstanceRequestResponseSchema.safeParse(base).success).toBe(true);
  });
});

describe('InboundEventSchema', () => {
  const base = {
    ...createSessionEnvelope('inbound_event', SESSION_ID),
    subscriptionId: 'isub_001',
    source: { kind: 'binding', binding: 'messenger' },
    eventType: 'message_received',
    data: { from: 'alice', body: 'hello' },
  };

  it('accepts a valid binding event', () => {
    expect(InboundEventSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a platform event', () => {
    const platform = {
      ...base,
      source: { kind: 'platform', namespace: 'boards' },
      eventType: 'task_created',
      data: { taskId: 't_1' },
    };
    expect(InboundEventSchema.safeParse(platform).success).toBe(true);
  });

  it('is a member of HostPushedEventSchema union', () => {
    expect(HostPushedEventSchema.safeParse(base).success).toBe(true);
  });
});

// ============================================================================
// Effective permissions & permissions_changed (R9 — Phase 5)
// ============================================================================

describe('EffectivePermissionsSchema', () => {
  it('accepts permissions-only permissions', () => {
    const result = EffectivePermissionsSchema.safeParse({
      permissions: { profile: 'basic' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts permissions with restrictions', () => {
    const result = EffectivePermissionsSchema.safeParse({
      permissions: { profile: 'full', network: { egress: ['api.github.com'] } },
      restrictions: { 'network:egress': ['api.github.com'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty permissions (no permissions approved)', () => {
    const result = EffectivePermissionsSchema.safeParse({ permissions: {} });
    expect(result.success).toBe(true);
  });

  it('rejects invalid permission values', () => {
    const result = EffectivePermissionsSchema.safeParse({
      permissions: { profile: 'invalid' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing permissions field', () => {
    const result = EffectivePermissionsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('PermissionsChangedEventSchema', () => {
  const base = {
    ...createSessionEnvelope('permissions_changed', 'sess_1'),
    permissions: {
      permissions: { profile: 'basic', network: { egress: ['api.github.com'] } },
    },
  };

  it('validates a permissions_changed event', () => {
    const result = PermissionsChangedEventSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('validates with restrictions', () => {
    const result = PermissionsChangedEventSchema.safeParse({
      ...base,
      permissions: {
        permissions: { profile: 'full' },
        restrictions: { repos: ['repo-a', 'repo-b'] },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing permissions field', () => {
    const { permissions: _, ...noPerm } = base;
    const result = PermissionsChangedEventSchema.safeParse(noPerm);
    expect(result.success).toBe(false);
  });

  it('is a member of HostPushedEventSchema union', () => {
    expect(HostPushedEventSchema.safeParse(base).success).toBe(true);
  });
});

// ============================================================================
// Objects — immutable blobs private to an Installation
// ============================================================================

describe('Object requests', () => {
  const info = {
    objectId: 'obj_0123456789abcdef0123456789abcdef',
    url: 'http://localhost:4100/objects/obj_0123456789abcdef0123456789abcdef',
    size: 3,
    contentType: 'text/plain',
    visibility: 'private' as const,
    createdAt: '2026-11-08T00:00:00.000Z',
  };

  it('object_put requires data and contentType; visibility is optional', () => {
    const base = {
      ...createSessionEnvelope('object_put', SESSION_ID),
      requestId: 'req_1',
      data: 'aGV5',
      contentType: 'text/plain',
    };
    expect(ObjectPutRequestSchema.safeParse(base).success).toBe(true);
    expect(ObjectPutRequestSchema.safeParse({ ...base, visibility: 'public' }).success).toBe(true);
    expect(ObjectPutRequestSchema.safeParse({ ...base, visibility: 'shared' }).success).toBe(false);
    const { contentType: _c, ...noType } = base;
    expect(ObjectPutRequestSchema.safeParse(noType).success).toBe(false);
    expect(InstanceRequestSchema.safeParse(base).success).toBe(true);
  });

  it('object_put_result carries the object info on success and an error otherwise', () => {
    const ok = {
      ...createSessionEnvelope('object_put_result', SESSION_ID),
      requestId: 'req_1',
      success: true,
      ...info,
    };
    expect(ObjectPutResultSchema.safeParse(ok).success).toBe(true);
    expect(InstanceRequestResponseSchema.safeParse(ok).success).toBe(true);
    const failed = {
      ...createSessionEnvelope('object_put_result', SESSION_ID),
      requestId: 'req_1',
      success: false,
      error: 'disk full',
    };
    expect(ObjectPutResultSchema.safeParse(failed).success).toBe(true);
  });

  it('object_get / object_delete / object_link need an objectId', () => {
    for (const [type, Schema] of [
      ['object_get', ObjectGetRequestSchema],
      ['object_delete', ObjectDeleteRequestSchema],
    ] as const) {
      const base = {
        ...createSessionEnvelope(type, SESSION_ID),
        requestId: 'r',
        objectId: info.objectId,
      };
      expect(Schema.safeParse(base).success).toBe(true);
      expect(Schema.safeParse({ ...base, objectId: '' }).success).toBe(false);
      expect(InstanceRequestSchema.safeParse(base).success).toBe(true);
    }
    const link = {
      ...createSessionEnvelope('object_link', SESSION_ID),
      requestId: 'r',
      objectId: info.objectId,
      expiresIn: 3600,
    };
    expect(ObjectLinkRequestSchema.safeParse(link).success).toBe(true);
    expect(ObjectLinkRequestSchema.safeParse({ ...link, expiresIn: 0 }).success).toBe(false);
    const { expiresIn: _e, ...noExpiry } = link;
    expect(ObjectLinkRequestSchema.safeParse(noExpiry).success).toBe(false);
  });

  it('object_get_result carries base64 data plus the info', () => {
    const ok = {
      ...createSessionEnvelope('object_get_result', SESSION_ID),
      requestId: 'r',
      success: true,
      data: 'aGV5',
      ...info,
    };
    expect(ObjectGetResultSchema.safeParse(ok).success).toBe(true);
    expect(InstanceRequestResponseSchema.safeParse(ok).success).toBe(true);
  });

  it('object_list paginates with limit and cursor', () => {
    const req = { ...createSessionEnvelope('object_list', SESSION_ID), requestId: 'r' };
    expect(ObjectListRequestSchema.safeParse(req).success).toBe(true);
    expect(
      ObjectListRequestSchema.safeParse({ ...req, limit: 10, cursor: info.objectId }).success,
    ).toBe(true);
    expect(ObjectListRequestSchema.safeParse({ ...req, limit: 0 }).success).toBe(false);
    const res = {
      ...createSessionEnvelope('object_list_result', SESSION_ID),
      requestId: 'r',
      success: true,
      objects: [info],
      nextCursor: info.objectId,
    };
    expect(ObjectListResultSchema.safeParse(res).success).toBe(true);
    expect(ObjectInfoSchema.safeParse(info).success).toBe(true);
  });

  it('object_delete_result and object_link_result', () => {
    expect(
      ObjectDeleteResultSchema.safeParse({
        ...createSessionEnvelope('object_delete_result', SESSION_ID),
        requestId: 'r',
        success: true,
      }).success,
    ).toBe(true);
    expect(
      ObjectLinkResultSchema.safeParse({
        ...createSessionEnvelope('object_link_result', SESSION_ID),
        requestId: 'r',
        success: true,
        url: `${info.url}?token=abc.def`,
        expiresAt: '2026-11-08T01:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('OBJECT_REQUEST_TYPES lists the five request types', () => {
    expect([...OBJECT_REQUEST_TYPES].sort()).toEqual(
      ['object_delete', 'object_get', 'object_link', 'object_list', 'object_put'].sort(),
    );
  });

  it('the removed volumes_* and files_* families are no longer accepted', () => {
    for (const type of ['volumes_put', 'files_put', 'files_get_public_url']) {
      expect(
        InstanceRequestSchema.safeParse({
          ...createSessionEnvelope(type, SESSION_ID),
          requestId: 'r',
          path: 'x',
          contentBase64: 'aGV5',
        }).success,
      ).toBe(false);
    }
  });
});
