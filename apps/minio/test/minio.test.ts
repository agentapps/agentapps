/**
 * Tests for the MinIO Agent App.
 *
 * Mocks the MinIO SDK client so tests run without a real MinIO server.
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { factory } from '../src/app.js';

// ---------------------------------------------------------------------------
// Mock the minio module
// ---------------------------------------------------------------------------

const mockMinioClient = {
  listBuckets: vi.fn(),
  makeBucket: vi.fn(),
  removeBucket: vi.fn(),
  bucketExists: vi.fn(),
  listObjects: vi.fn(),
  putObject: vi.fn(),
  fPutObject: vi.fn(),
  getObject: vi.fn(),
  fGetObject: vi.fn(),
  removeObject: vi.fn(),
  copyObject: vi.fn(),
  presignedGetObject: vi.fn(),
  presignedPutObject: vi.fn(),
  statObject: vi.fn(),
};

vi.mock('minio', () => ({
  default: { Client: vi.fn(() => mockMinioClient) },
  Client: vi.fn(() => mockMinioClient),
}));

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: Transport;
let received: MessageBase[];

function collectMessages(transport: Transport): MessageBase[] {
  const msgs: MessageBase[] = [];
  transport.onMessage((msg) => msgs.push(msg));
  return msgs;
}

async function waitFor(
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => predicate(m as Record<string, unknown>));
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Timeout waiting for message');
}

async function waitForType(type: string, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return waitFor((m) => m.type === type, timeoutMs);
}

async function initAndOpen(): Promise<string> {
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'test', version: '1.0.0' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitForType('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_minio',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitForType('session_opened');
  received.length = 0;
  return opened.sessionId as string;
}

function sendToolCall(sessionId: string, tool: string, args: Record<string, unknown>): void {
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool,
    arguments: args,
    context: { userId: 'u_test', installationId: 'inst_minio' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset all mock implementations
  for (const fn of Object.values(mockMinioClient)) fn.mockReset();

  // Default mock for listBuckets (used by health check)
  mockMinioClient.listBuckets.mockResolvedValue([]);

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.minio',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  host.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    const type = m.type as string;
    const sessionId = m.sessionId as string;
    const requestId = (m.requestId as string) ?? (m.id as string);

    if (type === 'get_system_secrets') {
      host.send({
        ...createEnvelope('system_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {
          ENDPOINT: 'http://localhost:9000',
          ACCESS_KEY: 'test-access-key',
          SECRET_KEY: 'test-secret-key',
        },
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
});

afterEach(async () => {
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MinIO Agent App', () => {
  it('lists all 11 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'bucket-exists',
      'copy-object',
      'create-bucket',
      'delete-bucket',
      'delete-object',
      'download-object',
      'get-object-info',
      'get-presigned-url',
      'list-buckets',
      'list-objects',
      'upload-object',
    ]);
  });

  it('health check reports ready with valid credentials', async () => {
    mockMinioClient.listBuckets.mockResolvedValue([{ name: 'test', creationDate: new Date() }]);

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('health check reports degraded when credentials are missing', async () => {
    const runtime = new InProcessRuntime(factory);
    const ctrl = new AppStation({
      appId: 'app.minio',
      appVersion: '2.0.0',
      runtime,
    });
    const [hostSide2, ctrlSide2] = createInProcessTransportPair();
    const received2: MessageBase[] = [];
    hostSide2.onMessage((msg) => received2.push(msg));

    hostSide2.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      const type = m.type as string;
      const sessionId = m.sessionId as string;
      const requestId = (m.requestId as string) ?? (m.id as string);

      if (type === 'get_system_secrets') {
        hostSide2.send({
          ...createEnvelope('system_secrets', sessionId),
          id: requestId,
          requestId,
          secrets: {},
        } as MessageBase);
      }
    });

    ctrl.accept(ctrlSide2);

    hostSide2.send({
      ...createEnvelope('initialize'),
      supportedVersions: [PROTOCOL_VERSION],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);

    const waitForType2 = async (type: string): Promise<Record<string, unknown>> => {
      const start = Date.now();
      while (Date.now() - start < 3000) {
        const found = received2.find((m) => (m as Record<string, unknown>).type === type);
        if (found) return found as Record<string, unknown>;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error('Timeout waiting for message');
    };

    await waitForType2('initialized');
    received2.length = 0;

    hostSide2.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_minio_nocreds',
      tenant: { userId: 'u_test' },
    } as MessageBase);
    const opened = await waitForType2('session_opened');
    received2.length = 0;

    hostSide2.send({
      ...createEnvelope('health_check'),
      sessionId: (opened as Record<string, unknown>).sessionId,
    } as MessageBase);
    const health = await waitForType2('health_status');

    expect(health.status).toBe('degraded');
    await ctrl.shutdown();
  });

  it('list-buckets returns bucket list', async () => {
    mockMinioClient.listBuckets.mockResolvedValue([
      { name: 'my-bucket', creationDate: new Date('2024-01-15T10:00:00Z') },
      { name: 'other-bucket', creationDate: new Date('2024-06-01T12:00:00Z') },
    ]);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-buckets', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const buckets = data.buckets as Array<Record<string, unknown>>;
    expect(buckets).toHaveLength(2);
    expect(buckets[0].name).toBe('my-bucket');
    expect(buckets[0].creationDate).toBe('2024-01-15T10:00:00.000Z');
    expect(buckets[1].name).toBe('other-bucket');
  });

  it('list-objects returns filtered objects from a bucket', async () => {
    const mockObjects = [
      {
        name: 'docs/readme.md',
        size: 1024,
        etag: 'abc123',
        lastModified: new Date('2024-03-01T08:00:00Z'),
      },
      {
        name: 'docs/guide.pdf',
        size: 2048,
        etag: 'def456',
        lastModified: new Date('2024-03-02T09:00:00Z'),
      },
    ];

    // Mock listObjects to return an async iterable
    mockMinioClient.listObjects.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        for (const obj of mockObjects) {
          yield obj;
        }
      },
    });

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-objects', { bucket: 'my-bucket', prefix: 'docs/' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.bucket).toBe('my-bucket');
    expect(data.prefix).toBe('docs/');
    expect(data.count).toBe(2);

    const objects = data.objects as Array<Record<string, unknown>>;
    expect(objects[0].name).toBe('docs/readme.md');
    expect(objects[0].size).toBe(1024);
    expect(objects[1].name).toBe('docs/guide.pdf');
  });

  it('upload-object uploads string content', async () => {
    mockMinioClient.putObject.mockResolvedValue({ etag: 'abc123', versionId: null });

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'upload-object', {
      bucket: 'my-bucket',
      objectName: 'notes/hello.txt',
      content: 'Hello, MinIO!',
      contentType: 'text/plain',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.bucket).toBe('my-bucket');
    expect(data.objectName).toBe('notes/hello.txt');
    expect(data.size).toBe(Buffer.from('Hello, MinIO!', 'utf-8').length);

    // Verify the client was called with correct args
    expect(mockMinioClient.putObject).toHaveBeenCalledWith(
      'my-bucket',
      'notes/hello.txt',
      expect.any(Buffer),
      13,
      { 'Content-Type': 'text/plain' },
    );
  });

  it('get-presigned-url generates a GET presigned URL', async () => {
    mockMinioClient.presignedGetObject.mockResolvedValue(
      'http://localhost:9000/my-bucket/file.pdf?X-Amz-Signature=abc123',
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-presigned-url', {
      bucket: 'my-bucket',
      objectName: 'file.pdf',
      expiry: 7200,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.bucket).toBe('my-bucket');
    expect(data.objectName).toBe('file.pdf');
    expect(data.method).toBe('GET');
    expect(data.url).toContain('X-Amz-Signature');
    expect(data.expirySeconds).toBe(7200);

    expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith('my-bucket', 'file.pdf', 7200);
  });

  it('delete-object removes an object', async () => {
    mockMinioClient.removeObject.mockResolvedValue(undefined);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'delete-object', {
      bucket: 'my-bucket',
      objectName: 'old-file.txt',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.bucket).toBe('my-bucket');
    expect(data.objectName).toBe('old-file.txt');
    expect(data.deleted).toBe(true);

    expect(mockMinioClient.removeObject).toHaveBeenCalledWith('my-bucket', 'old-file.txt');
  });

  it('tool call fails when MinIO server is unreachable', async () => {
    mockMinioClient.listBuckets.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9000'));

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-buckets', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('ECONNREFUSED');
  });

  it('tool call fails when bucket does not exist', async () => {
    mockMinioClient.listObjects.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield* []; // ensure generator yields before throwing
        throw new Error('The specified bucket does not exist: NoSuchBucket');
      },
    });

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-objects', { bucket: 'nonexistent-bucket' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('bucket');
  });
});
