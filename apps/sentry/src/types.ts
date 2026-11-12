/**
 * Sentry API types and fetch helper.
 */

const SENTRY_API_URL = 'https://sentry.io/api/0';

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export interface SentryOrganization {
  id: string;
  slug: string;
  name: string;
  dateCreated: string;
}

export interface SentryProject {
  id: string;
  slug: string;
  name: string;
  platform: string;
  dateCreated: string;
  firstEvent: string | null;
  hasAccess: boolean;
}

export interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: string;
  status: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  project: { slug: string };
  platform: string;
  type: string;
  metadata: unknown;
  annotations: unknown[];
  assignedTo: unknown;
  isSubscribed: boolean;
  hasSeen: boolean;
  permalink: string;
}

export interface SentryRelease {
  version: string;
  shortVersion: string;
  status: string;
  ref: string | null;
  url: string | null;
  dateCreated: string;
  dateReleased: string | null;
  newGroups: number;
  firstEvent: string | null;
  lastEvent: string | null;
  projects: Array<{ slug: string }>;
}

export interface SentryTeam {
  id: string;
  slug: string;
  name: string;
  dateCreated: string;
  memberCount: number;
}

export interface SentryAlertRule {
  id: string;
  name: string;
  environment: string | null;
  actionMatch: string;
  frequency: number;
  dateCreated: string;
  status: string;
}

export interface SentryEvent {
  eventID: string;
  id: string;
  title: string;
  message: string;
  dateCreated: string;
  user: unknown;
  tags: unknown[];
  platform: string;
  sdk: unknown;
  contexts: unknown;
  entries: Array<{
    type: string;
    data?: {
      values?: Array<{
        type: string;
        value: string;
        stacktrace?: {
          frames?: Array<{
            filename: string;
            function: string;
            lineNo: number;
            colNo: number;
            context: unknown;
            inApp: boolean;
          }>;
        };
      }>;
    };
  }>;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

export async function sentryRequest<T>(
  endpoint: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${SENTRY_API_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Sentry API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}
