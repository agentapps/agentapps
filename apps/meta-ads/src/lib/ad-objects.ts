import { type Args, readEnum, readId } from './args.js';
import { ApiError, apiRequest, type ClientContext } from './client.js';

export const OBJECT_LEVELS = ['campaign', 'adset', 'ad'] as const;
export type ObjectLevel = (typeof OBJECT_LEVELS)[number];

/**
 * A field only that object type has. Asking for it proves the id is of the type the agent
 * named: Graph rejects an unknown field with "(#100) Tried accessing nonexisting field", so
 * a write never lands on the wrong kind of object (pausing an ad set instead of an ad).
 */
const MARKER_FIELD: Record<ObjectLevel, string> = {
  campaign: 'objective',
  adset: 'optimization_goal',
  ad: 'adset_id',
};

const LABEL: Record<ObjectLevel, string> = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };

export interface AdObject {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

export function readTarget(a: Args, levels: readonly ObjectLevel[] = OBJECT_LEVELS) {
  const level = readEnum(a, 'level', levels);
  if (!level) throw new Error(`[BAD_REQUEST] level is required: one of ${levels.join(', ')}.`);
  const id = readId(a, 'id', { required: true });
  return { level, id, label: LABEL[level] };
}

/** Reads the object the write is about, and checks that it is of the given level. */
export async function fetchAdObject(
  ctx: ClientContext,
  level: ObjectLevel,
  id: string,
  extraFields: string[] = [],
): Promise<AdObject> {
  try {
    return await apiRequest<AdObject>('GET', `/${id}`, ctx, {
      params: {
        fields: ['id', 'name', 'status', 'effective_status', MARKER_FIELD[level], ...extraFields],
      },
    });
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.graphCode === 100 &&
      /nonexisting field/i.test(err.message)
    ) {
      const nodeType = /node type \((\w+)\)/.exec(err.message)?.[1];
      throw new Error(
        `[BAD_REQUEST] ${id} is not a ${LABEL[level]}${nodeType ? ` (Meta says it is a ${nodeType})` : ''}. Check the id, or pass the level that matches it. Nothing was changed.`,
      );
    }
    throw err;
  }
}
