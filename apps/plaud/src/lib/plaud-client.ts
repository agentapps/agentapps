/**
 * PLAUD MCP Client
 *
 * Connects to the official Plaud MCP server at https://mcp.plaud.ai/mcp using
 * the Model Context Protocol (MCP) SDK over HTTP (streamable) transport.
 *
 * OAuth tokens are managed by the platform backend (standard OAuth2 + PKCE) and
 * served to this app via installation secrets (ACCESS_TOKEN, REFRESH_TOKEN, EXPIRY_DATE).
 * The backend refreshes the access token automatically; the app only consumes it.
 */

import type { OAuthClientProvider, OAuthTokens } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// =============================================================================
// TYPES
// =============================================================================

/** Shape of installation secrets needed by the Plaud client. */
export interface PlaudSecrets {
  /** Plaud MCP server base URL (default: https://mcp.plaud.ai/mcp). */
  PLAUD_MCP_URL?: string;
  /** OAuth access token issued by the platform backend OAuth flow. */
  ACCESS_TOKEN?: string;
  /** OAuth refresh token issued by the platform backend OAuth flow. */
  REFRESH_TOKEN?: string;
  /** ISO 8601 expiry date of the OAuth access token. */
  EXPIRY_DATE?: string;
}

export interface PlaudRecording {
  id: string;
  title: string;
  created_at: string;
  start_at?: string;
  duration_seconds: number;
  serial_number?: string;
  tag?: string;
}

export interface PlaudTranscriptSegment {
  text: string;
  start_time?: number;
  end_time?: number;
  speaker?: string;
}

export interface PlaudNoteDetail {
  id: string;
  title: string;
  created_at: string;
  duration_seconds: number;
  transcript: string;
  segments: PlaudTranscriptSegment[];
  ai_content: unknown;
}

export interface PlaudTag {
  id: string;
  name: string;
  count?: number;
}

export interface PlaudUser {
  id: string;
  email?: string;
  name?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_MCP_URL = 'https://mcp.plaud.ai/mcp';

// =============================================================================
// SECRET RESOLUTION
// =============================================================================

/** Context shape accepted by secret-reading helpers. */
export interface SecretsContext {
  secrets: {
    getSystem(): Promise<Record<string, string> | null>;
    getInstallation(): Promise<Record<string, string> | null>;
  };
}

export async function getPlaudSecrets(context: SecretsContext): Promise<PlaudSecrets> {
  const installationSecrets = ((await context.secrets.getInstallation()) ?? {}) as PlaudSecrets;
  return {
    PLAUD_MCP_URL: (installationSecrets.PLAUD_MCP_URL ?? DEFAULT_MCP_URL).replace(/\/+$/, ''),
    ACCESS_TOKEN: installationSecrets.ACCESS_TOKEN,
    REFRESH_TOKEN: installationSecrets.REFRESH_TOKEN,
    EXPIRY_DATE: installationSecrets.EXPIRY_DATE,
  };
}

// =============================================================================
// OAUTH CLIENT PROVIDER
// =============================================================================

/**
 * Minimal OAuthClientProvider for the Plaud MCP SDK.
 *
 * The platform backend owns the OAuth flow, token storage and refresh. This
 * provider simply returns the current access token from installation secrets and
 * ignores in-app token persistence. The SDK still needs an OAuthClientProvider
 * to attach the Bearer token to outgoing MCP requests.
 */
class PlaudOAuthProvider implements OAuthClientProvider {
  private readonly secrets: PlaudSecrets;

  constructor(secrets: PlaudSecrets) {
    this.secrets = secrets;
  }

  get redirectUrl(): string | URL | undefined {
    return undefined;
  }

  get clientMetadataUrl(): string | undefined {
    return undefined;
  }

  get clientMetadata() {
    return {
      redirect_uris: [],
      token_endpoint_auth_method: 'none' as const,
      grant_types: ['authorization_code', 'refresh_token'] as const,
      response_types: ['code'] as const,
      client_name: 'Agent Apps',
      client_uri: 'https://agentapps.tech',
    };
  }

  async clientInformation(): Promise<Record<string, unknown> | undefined> {
    return undefined;
  }

  async saveClientInformation(): Promise<void> {
    // No dynamic client registration needed; backend manages the OAuth client.
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    if (!this.secrets.ACCESS_TOKEN) return undefined;
    return {
      access_token: this.secrets.ACCESS_TOKEN,
      token_type: 'Bearer',
      refresh_token: this.secrets.REFRESH_TOKEN,
      expires_in: this.secrets.EXPIRY_DATE
        ? Math.max(
            0,
            Math.floor((new Date(this.secrets.EXPIRY_DATE).getTime() - Date.now()) / 1000),
          )
        : undefined,
    };
  }

  async saveTokens(): Promise<void> {
    // Backend owns token persistence; ignore SDK callbacks.
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    throw new Error(
      `PLAUD authorization required. Open this URL in a browser and authorize the app: ${authorizationUrl.toString()}`,
    );
  }

  async prepareTokenRequest(): Promise<URLSearchParams> {
    throw new Error('Token refresh is handled by the platform backend, not the PLAUD app');
  }

  async saveCodeVerifier(): Promise<void> {
    // PKCE verifier is managed by the backend OAuth flow.
  }

  async codeVerifier(): Promise<string> {
    throw new Error('PKCE verifier is managed by the platform backend OAuth flow');
  }
}

// =============================================================================
// MCP CLIENT
// =============================================================================

export class PlaudClient {
  private readonly secrets: PlaudSecrets;
  private readonly injectedTransport?: unknown;
  private mcpClient: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  constructor(secrets: PlaudSecrets, injectedTransport?: unknown) {
    this.secrets = secrets;
    this.injectedTransport = injectedTransport;
  }

  async connect(): Promise<void> {
    if (this.mcpClient) return;

    this.mcpClient = new Client(
      { name: 'agentapps-plaud', version: '2.0.0' },
      { capabilities: {} },
    );

    if (this.injectedTransport) {
      // Test path: bypass HTTP transport and OAuth entirely.
      await this.mcpClient.connect(this.injectedTransport as any);
      return;
    }

    const provider = new PlaudOAuthProvider(this.secrets);
    const url = new URL(this.secrets.PLAUD_MCP_URL ?? DEFAULT_MCP_URL);

    this.transport = new StreamableHTTPClientTransport(url, { authProvider: provider });
    await this.mcpClient.connect(this.transport);
  }

  async close(): Promise<void> {
    if (this.mcpClient) {
      await this.mcpClient.close();
      this.mcpClient = null;
    }
    this.transport = null;
  }

  async listRecordings(args: Record<string, unknown> = {}): Promise<unknown> {
    await this.connect();
    const result = await this.mcpClient?.callTool({ name: 'list_files', arguments: args });
    return extractToolResult(result);
  }

  async getFileDetail(fileId: string): Promise<unknown> {
    await this.connect();
    const result = await this.mcpClient?.callTool({
      name: 'get_file',
      arguments: { file_id: fileId },
    });
    return extractToolResult(result);
  }

  async getNote(fileId: string): Promise<unknown> {
    await this.connect();
    const result = await this.mcpClient?.callTool({
      name: 'get_note',
      arguments: { file_id: fileId },
    });
    return extractToolResult(result);
  }

  async getTranscript(fileId: string): Promise<unknown> {
    await this.connect();
    const result = await this.mcpClient?.callTool({
      name: 'get_transcript',
      arguments: { file_id: fileId },
    });
    return extractToolResult(result);
  }

  async getCurrentUser(): Promise<unknown> {
    await this.connect();
    const result = await this.mcpClient?.callTool({ name: 'get_current_user', arguments: {} });
    return extractToolResult(result);
  }

  async listTags(): Promise<unknown> {
    await this.connect();
    const result = await this.mcpClient?.callTool({ name: 'list_files', arguments: {} });
    // Plaud does not expose a dedicated tags tool; fall back to client-side
    // extraction once we know the shape of list_files responses.
    return extractToolResult(result);
  }
}

function extractToolResult(result: { content?: Array<{ type: string; text?: string }> }): unknown {
  if (!result || !Array.isArray(result.content)) return result;
  const textBlocks = result.content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string);
  if (textBlocks.length === 0) return result;
  const combined = textBlocks.join('\n');
  try {
    return JSON.parse(combined);
  } catch {
    return combined;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export async function getPlaudClient(
  context: SecretsContext,
  injectedTransport?: unknown,
): Promise<PlaudClient> {
  const secrets = await getPlaudSecrets(context);
  const client = new PlaudClient(secrets, injectedTransport);
  return client;
}

// =============================================================================
// DATA MAPPERS
// =============================================================================

/**
 * Map a raw API recording item to PlaudRecording.
 * The official MCP shape is still being validated; field names are mapped defensively.
 */
export function mapRecording(raw: Record<string, unknown>): PlaudRecording {
  // Plaud's official MCP returns `duration` in milliseconds. Defensive fallbacks
  // with `_seconds` / `Seconds` suffixes are treated as seconds.
  const msDuration = (raw.duration ?? 0) as number;
  const secondsDuration = (raw.duration_seconds ?? raw.durationSeconds ?? 0) as number;
  const durationSeconds = msDuration > 0 ? msDuration / 1000 : secondsDuration;
  return {
    id: (raw.file_id ?? raw.id ?? raw.fileId ?? '') as string,
    title: (raw.name ?? raw.title ?? raw.file_name ?? raw.fileName ?? raw.filename ?? '') as string,
    created_at: (raw.created_at ??
      raw.create_time ??
      raw.createdAt ??
      raw.createTime ??
      '') as string,
    start_at: (raw.start_at ?? raw.startAt ?? raw.start_time ?? raw.startTime ?? undefined) as
      | string
      | undefined,
    duration_seconds: durationSeconds,
    serial_number: (raw.serial_number ?? raw.serialNumber ?? undefined) as string | undefined,
    tag: (raw.tag_name ?? raw.tag ?? raw.folder ?? undefined) as string | undefined,
  };
}

/** Map raw transcript segments from the detail API response. */
export function mapSegments(raw: unknown): PlaudTranscriptSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((seg: Record<string, unknown>) => ({
    text: (seg.text ?? seg.content ?? '') as string,
    start_time: (seg.start_time ?? seg.start ?? seg.startTime ?? undefined) as number | undefined,
    end_time: (seg.end_time ?? seg.end ?? seg.endTime ?? undefined) as number | undefined,
    speaker: (seg.speaker ?? seg.speaker_label ?? seg.speakerId ?? undefined) as string | undefined,
  }));
}

/** Map a raw detail API response to PlaudNoteDetail. */
export function mapNoteDetail(raw: Record<string, unknown>): PlaudNoteDetail {
  // Plaud's official MCP returns transcript segments in `source_list` and AI notes
  // in `note_list` (array of Markdown strings). We keep defensive fallbacks for
  // any non-standard shapes we may encounter during the rollout.
  const segments = mapSegments(
    raw.source_list ?? raw.transcript_segments ?? raw.segments ?? raw.content_list ?? [],
  );
  const transcript = segments.map((s) => s.text).join(' ');

  // Plaud's official MCP returns `duration` in milliseconds. Defensive fallbacks
  // with `_seconds` / `Seconds` suffixes are treated as seconds.
  const msDuration = (raw.duration ?? 0) as number;
  const secondsDuration = (raw.duration_seconds ?? raw.durationSeconds ?? 0) as number;
  const durationSeconds = msDuration > 0 ? msDuration / 1000 : secondsDuration;

  const noteList = raw.note_list;
  const aiContent = noteList ?? raw.ai_content ?? raw.note_content ?? raw.summary ?? null;

  return {
    id: (raw.file_id ?? raw.id ?? raw.fileId ?? '') as string,
    title: (raw.name ?? raw.title ?? raw.file_name ?? raw.filename ?? '') as string,
    created_at: (raw.created_at ?? raw.create_time ?? raw.createdAt ?? '') as string,
    duration_seconds: durationSeconds,
    transcript,
    segments,
    ai_content: aiContent,
  };
}

/** Map a raw tag item to PlaudTag. */
export function mapTag(raw: Record<string, unknown>): PlaudTag {
  return {
    id: (raw.tag_id ?? raw.id ?? '') as string,
    name: (raw.tag_name ?? raw.name ?? '') as string,
    count: (raw.file_count ?? raw.count ?? raw.recording_count ?? undefined) as number | undefined,
  };
}

/** Map a raw user object to PlaudUser. */
export function mapUser(raw: Record<string, unknown>): PlaudUser {
  return {
    id: (raw.user_id ?? raw.id ?? raw.sub ?? '') as string,
    email: (raw.email ?? undefined) as string | undefined,
    name: (raw.name ?? raw.display_name ?? raw.nickname ?? undefined) as string | undefined,
  };
}
