import type { AgentApp } from '@agentapps/sdk';
import { accountApiJson, normalizeRegion } from '../lib/make-client.js';
import { clampLimit, clampOffset, getUserSecretsSafe, requireApiToken } from './_helpers.js';

interface RawScenario {
  id?: number | string;
  name?: string;
  isActive?: boolean;
  isPaused?: boolean;
  teamId?: number | string;
  description?: string;
  folderId?: number | string | null;
}

interface RawPg {
  limit?: number;
  offset?: number;
  total?: number;
  totalCount?: number;
}

interface RawListResponse {
  scenarios?: RawScenario[];
  pg?: RawPg;
}

interface ScenarioItem {
  id: string;
  name: string;
  isActive: boolean | null;
  isPaused: boolean | null;
  teamId: string | null;
  description?: string;
  folderId?: string;
}

function pickScenario(s: RawScenario): ScenarioItem {
  const item: ScenarioItem = {
    id: s.id != null ? String(s.id) : '',
    name: s.name ?? '(unnamed scenario)',
    isActive: typeof s.isActive === 'boolean' ? s.isActive : null,
    isPaused: typeof s.isPaused === 'boolean' ? s.isPaused : null,
    teamId: s.teamId != null ? String(s.teamId) : null,
  };
  if (s.description) item.description = s.description;
  if (s.folderId != null) item.folderId = String(s.folderId);
  return item;
}

function upstreamTotal(pg: RawPg | undefined): number | null {
  if (typeof pg?.total === 'number') return pg.total;
  if (typeof pg?.totalCount === 'number') return pg.totalCount;
  return null;
}

/**
 * list-scenarios — list the account's Make scenarios (requires MAKE_API_TOKEN).
 */
export function registerListScenariosTool(app: AgentApp): void {
  app.tool('list-scenarios', {
    description:
      'List Make.com scenarios for the configured account (requires MAKE_API_TOKEN in installation secrets). Optionally filter by teamId and page with limit/offset. Returns { scenarios: [{ id, name, isActive, isPaused, teamId }], returned, total, offset, limit, hasMore, nextOffset, teamId, region }. When hasMore is true, call again with offset=nextOffset to fetch the next page.',
    parameters: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description:
            'Make team id to scope the scenarios (found in the team URL). Required by the Make API on most accounts.',
        },
        limit: {
          type: 'number',
          description: 'Max scenarios to return per page (1-100, default 50).',
        },
        offset: {
          type: 'number',
          description:
            'Number of scenarios to skip for pagination (default 0). Pass the `nextOffset` from a previous response to fetch the next page.',
        },
        includeRaw: {
          type: 'boolean',
          description:
            'Include the unprocessed upstream scenario rows under `raw` for debugging (default false).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getUserSecretsSafe(ctx);
      const apiKey = requireApiToken(secrets);
      const region = normalizeRegion(secrets.MAKE_REGION);

      const teamId = a.teamId != null ? String(a.teamId).trim() : '';
      const limit = clampLimit(a.limit);
      const offset = clampOffset(a.offset);
      const includeRaw = a.includeRaw === true;

      const searchParams: Record<string, string> = { 'pg[limit]': String(limit) };
      if (offset > 0) searchParams['pg[offset]'] = String(offset);
      if (teamId) searchParams.teamId = teamId;

      const data = await accountApiJson<RawListResponse>('GET', '/scenarios', {
        apiKey,
        region,
        searchParams,
      });

      const rawScenarios = data.scenarios ?? [];
      const scenarios = rawScenarios.map(pickScenario);
      const returned = scenarios.length;

      const total = upstreamTotal(data.pg);
      const hasMore = total != null ? offset + returned < total : returned >= limit;
      const nextOffset = hasMore ? offset + returned : null;

      const result: Record<string, unknown> = {
        scenarios,
        returned,
        total: total ?? offset + returned,
        offset,
        limit,
        hasMore,
        nextOffset,
        teamId: teamId || null,
        region,
      };
      if (includeRaw) result.raw = rawScenarios;
      return result;
    },
  });
}
