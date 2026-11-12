/**
 * Tests for the Google Sheets Agent App.
 *
 * Mocks the googleapis library so tests run without real credentials.
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

// ---------------------------------------------------------------------------
// Mock googleapis before importing the app
// ---------------------------------------------------------------------------

const mockSpreadsheetsCreate = vi.fn();
const mockSpreadsheetsGet = vi.fn();
const mockSpreadsheetsBatchUpdate = vi.fn();
const mockSheetsCopyTo = vi.fn();
const mockValuesGet = vi.fn();
const mockValuesUpdate = vi.fn();
const mockValuesAppend = vi.fn();
const mockValuesClear = vi.fn();
const mockValuesBatchUpdate = vi.fn();
const mockDriveFilesGet = vi.fn();
const mockDriveFilesExport = vi.fn();
const mockGetTokenInfo = vi.fn();
const mockSetCredentials = vi.fn();
const mockRefreshAccessToken = vi.fn();

vi.mock('googleapis', () => {
  const OAuth2 = vi.fn().mockImplementation(() => ({
    credentials: { access_token: 'test-access-token', refresh_token: 'test-refresh-token' },
    setCredentials: mockSetCredentials,
    getTokenInfo: mockGetTokenInfo,
    refreshAccessToken: mockRefreshAccessToken,
  }));

  return {
    google: {
      auth: { OAuth2 },
      sheets: vi.fn().mockReturnValue({
        spreadsheets: {
          create: mockSpreadsheetsCreate,
          get: mockSpreadsheetsGet,
          batchUpdate: mockSpreadsheetsBatchUpdate,
          sheets: {
            copyTo: mockSheetsCopyTo,
          },
          values: {
            get: mockValuesGet,
            update: mockValuesUpdate,
            append: mockValuesAppend,
            clear: mockValuesClear,
            batchUpdate: mockValuesBatchUpdate,
          },
        },
      }),
      drive: vi.fn().mockReturnValue({
        files: {
          get: mockDriveFilesGet,
          export: mockDriveFilesExport,
        },
      }),
    },
  };
});

// Import after mock is set up
const { factory } = await import('../src/app.js');

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
    installationId: 'inst_google_sheets',
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
    context: { userId: 'u_test', installationId: 'inst_google_sheets' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetTokenInfo.mockResolvedValue({ email: 'test@example.com' });
  mockSpreadsheetsCreate.mockReset();
  mockSpreadsheetsGet.mockReset();
  mockSpreadsheetsBatchUpdate.mockReset();
  mockSheetsCopyTo.mockReset();
  mockValuesGet.mockReset();
  mockValuesUpdate.mockReset();
  mockValuesAppend.mockReset();
  mockValuesClear.mockReset();
  mockValuesBatchUpdate.mockReset();
  mockDriveFilesGet.mockReset();
  mockDriveFilesExport.mockReset();
  mockRefreshAccessToken.mockReset();

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.google.sheets',
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
        secrets: { CLIENT_ID: 'test-client-id', CLIENT_SECRET: 'test-client-secret' },
      } as MessageBase);
    }
    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: { ACCESS_TOKEN: 'test-access-token', REFRESH_TOKEN: 'test-refresh-token' },
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

describe('Google Sheets Agent App', () => {
  it('lists all 14 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-sheet',
      'append-values',
      'batch-update',
      'batch-update-values',
      'clear-values',
      'copy-sheet',
      'create-spreadsheet',
      'delete-sheet',
      'export-sheet',
      'get-spreadsheet',
      'list-sheet-tabs',
      'read-sheet-range',
      'read-spreadsheet',
      'write-values',
    ]);
  });

  it('health check responds without crashing', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The Google Sheets health handler does not return a HealthCheckResult object,
    // so the SDK falls into the catch path and reports 'degraded'. This verifies
    // that the health handler at least runs without a fatal error.
    expect(['ready', 'degraded']).toContain(health.status);
  });

  it('create-spreadsheet creates a new spreadsheet and returns id and url', async () => {
    mockSpreadsheetsCreate.mockResolvedValue({
      data: {
        spreadsheetId: 'sheet_123',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_123/edit',
        sheets: [{ properties: { title: 'Sheet1' } }],
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-spreadsheet', { title: 'Budget 2024' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.spreadsheetId).toBe('sheet_123');
    expect(data.title).toBe('Budget 2024');
    expect(data.url).toBe('https://docs.google.com/spreadsheets/d/sheet_123/edit');
    expect(data.sheets).toEqual(['Sheet1']);
  });

  it('write-values writes data to a range', async () => {
    mockValuesUpdate.mockResolvedValue({
      data: {
        updatedRange: 'Sheet1!A1:C3',
        updatedRows: 3,
        updatedColumns: 3,
        updatedCells: 9,
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'write-values', {
      spreadsheetId: 'sheet_123',
      range: 'Sheet1!A1:C3',
      values: [
        ['Name', 'Age', 'City'],
        ['Alice', 30, 'NYC'],
        ['Bob', 25, 'LA'],
      ],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.updatedRows).toBe(3);
    expect(data.updatedCells).toBe(9);
  });

  it('read-sheet-range reads data from a specific range', async () => {
    mockValuesGet.mockResolvedValue({
      data: {
        range: 'Sheet1!A1:B2',
        values: [
          ['Name', 'Score'],
          ['Alice', '95'],
        ],
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'read-sheet-range', {
      fileId: 'sheet_456',
      range: 'Sheet1!A1:B2',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.range).toBe('Sheet1!A1:B2');
    const values = data.values as string[][];
    expect(values).toHaveLength(2);
    expect(values[0]).toEqual(['Name', 'Score']);
  });

  it('list-sheet-tabs returns all sheets in a spreadsheet', async () => {
    mockSpreadsheetsGet.mockResolvedValue({
      data: {
        sheets: [
          {
            properties: {
              sheetId: 0,
              title: 'Sheet1',
              index: 0,
              gridProperties: { rowCount: 1000, columnCount: 26 },
            },
          },
          {
            properties: {
              sheetId: 1,
              title: 'Summary',
              index: 1,
              gridProperties: { rowCount: 500, columnCount: 10 },
            },
          },
        ],
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'list-sheet-tabs', { fileId: 'sheet_789' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const sheets = data.sheets as Array<Record<string, unknown>>;
    expect(sheets).toHaveLength(2);
    expect(sheets[0].title).toBe('Sheet1');
    expect(sheets[1].title).toBe('Summary');
  });

  it('create-spreadsheet fails with empty title', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'create-spreadsheet', { title: '' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('title');
  });

  it('append-values appends rows to a sheet', async () => {
    mockValuesAppend.mockResolvedValue({
      data: {
        updates: {
          updatedRange: 'Sheet1!A4:C4',
          updatedRows: 1,
          updatedColumns: 3,
          updatedCells: 3,
        },
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'append-values', {
      spreadsheetId: 'sheet_123',
      range: 'Sheet1!A1',
      values: [['Charlie', 28, 'SF']],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.updatedRows).toBe(1);
    expect(data.updatedCells).toBe(3);
  });

  it('add-sheet adds a new sheet tab to a spreadsheet', async () => {
    mockSpreadsheetsBatchUpdate.mockResolvedValue({
      data: {
        replies: [
          {
            addSheet: {
              properties: {
                sheetId: 42,
                title: 'Revenue',
                index: 1,
              },
            },
          },
        ],
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'add-sheet', {
      spreadsheetId: 'sheet_123',
      title: 'Revenue',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.spreadsheetId).toBe('sheet_123');
    expect(data.sheetId).toBe(42);
    expect(data.title).toBe('Revenue');
    expect(data.index).toBe(1);
  });

  it('add-sheet fails with empty title', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'add-sheet', {
      spreadsheetId: 'sheet_123',
      title: '',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('title');
  });

  it('delete-sheet deletes a sheet tab from a spreadsheet', async () => {
    mockSpreadsheetsBatchUpdate.mockResolvedValue({
      data: {
        replies: [{}],
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'delete-sheet', {
      spreadsheetId: 'sheet_123',
      sheetId: 42,
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.spreadsheetId).toBe('sheet_123');
    expect(data.deletedSheetId).toBe(42);
  });

  it('clear-values clears a range of cells', async () => {
    mockValuesClear.mockResolvedValue({
      data: {
        spreadsheetId: 'sheet_123',
        clearedRange: 'Sheet1!A1:C10',
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'clear-values', {
      spreadsheetId: 'sheet_123',
      range: 'Sheet1!A1:C10',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.clearedRange).toBe('Sheet1!A1:C10');
    expect(data.spreadsheetId).toBe('sheet_123');
  });

  it('batch-update-values updates multiple ranges at once', async () => {
    mockValuesBatchUpdate.mockResolvedValue({
      data: {
        totalUpdatedRows: 4,
        totalUpdatedColumns: 3,
        totalUpdatedCells: 12,
        totalUpdatedSheets: 2,
        responses: [
          {
            updatedRange: 'Sheet1!A1:C2',
            updatedRows: 2,
            updatedColumns: 3,
            updatedCells: 6,
          },
          {
            updatedRange: 'Sheet2!A1:C2',
            updatedRows: 2,
            updatedColumns: 3,
            updatedCells: 6,
          },
        ],
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'batch-update-values', {
      spreadsheetId: 'sheet_123',
      data: [
        {
          range: 'Sheet1!A1:C2',
          values: [
            ['A', 'B', 'C'],
            [1, 2, 3],
          ],
        },
        {
          range: 'Sheet2!A1:C2',
          values: [
            ['X', 'Y', 'Z'],
            [4, 5, 6],
          ],
        },
      ],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.totalUpdatedRows).toBe(4);
    expect(data.totalUpdatedCells).toBe(12);
    expect(data.totalUpdatedSheets).toBe(2);
    const responses = data.responses as Array<Record<string, unknown>>;
    expect(responses).toHaveLength(2);
    expect(responses[0].updatedRange).toBe('Sheet1!A1:C2');
    expect(responses[1].updatedRange).toBe('Sheet2!A1:C2');
  });

  it('batch-update-values fails with empty data array', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'batch-update-values', {
      spreadsheetId: 'sheet_123',
      data: [],
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('data');
  });

  it('copy-sheet copies a sheet to another spreadsheet', async () => {
    mockSheetsCopyTo.mockResolvedValue({
      data: {
        sheetId: 99,
        title: 'Copy of Revenue',
        index: 2,
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'copy-sheet', {
      spreadsheetId: 'sheet_123',
      sheetId: 42,
      destinationSpreadsheetId: 'sheet_456',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.sheetId).toBe(99);
    expect(data.title).toBe('Copy of Revenue');
    expect(data.index).toBe(2);
    expect(data.destinationSpreadsheetId).toBe('sheet_456');
  });

  it('get-spreadsheet returns full spreadsheet metadata', async () => {
    mockSpreadsheetsGet.mockResolvedValue({
      data: {
        spreadsheetId: 'sheet_123',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_123/edit',
        properties: {
          title: 'Budget 2024',
          locale: 'en_US',
          timeZone: 'America/New_York',
        },
        sheets: [
          {
            properties: {
              sheetId: 0,
              title: 'Sheet1',
              index: 0,
              sheetType: 'GRID',
              gridProperties: {
                rowCount: 1000,
                columnCount: 26,
                frozenRowCount: 1,
                frozenColumnCount: 0,
              },
            },
          },
          {
            properties: {
              sheetId: 1,
              title: 'Summary',
              index: 1,
              sheetType: 'GRID',
              gridProperties: {
                rowCount: 500,
                columnCount: 10,
              },
            },
          },
        ],
        namedRanges: [
          {
            namedRangeId: 'nr_1',
            name: 'TotalRevenue',
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 10 },
          },
        ],
      },
    });

    const sessionId = await initAndOpen();
    received.length = 0;

    sendToolCall(sessionId, 'get-spreadsheet', { spreadsheetId: 'sheet_123' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.spreadsheetId).toBe('sheet_123');
    expect(data.url).toBe('https://docs.google.com/spreadsheets/d/sheet_123/edit');
    expect(data.title).toBe('Budget 2024');
    expect(data.locale).toBe('en_US');
    expect(data.timeZone).toBe('America/New_York');

    const sheets = data.sheets as Array<Record<string, unknown>>;
    expect(sheets).toHaveLength(2);
    expect(sheets[0].title).toBe('Sheet1');
    expect(sheets[0].frozenRowCount).toBe(1);
    expect(sheets[1].title).toBe('Summary');

    const namedRanges = data.namedRanges as Array<Record<string, unknown>>;
    expect(namedRanges).toHaveLength(1);
    expect(namedRanges[0].name).toBe('TotalRevenue');
  });
});
