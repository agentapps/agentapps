import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { isFileId } from './_helpers.js';
import { SlackApiError } from './_slack-error.js';
import { wrapSlackMutation } from './utils.js';

interface ShareFilePublicArgs {
  fileId: string;
}

export function registerShareFilePublicTool(app: AgentApp): void {
  app.tool('share-file-public', {
    description:
      'Make a file publicly accessible via URL (anyone with link can view, no login). Returns { fileId, permalinkPublic }. Not retryable. Params: fileId (F...).',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Slack file id.' },
      },
      required: ['fileId'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const { fileId } = args as unknown as ShareFilePublicArgs;
      if (!isFileId(fileId)) {
        throw new Error(`Invalid fileId: expected F..., got "${fileId}"`);
      }
      const { client } = await getSlackSession(ctx);
      // Slack Free workspaces forbid `files.sharedPublicURL` and surface this as
      // a generic `not_allowed` error code. The transversal classifier maps
      // `not_allowed` to BUSINESS_RULE (the conservative choice since the same
      // code is reused for per-resource permission denials elsewhere). For THIS
      // tool we know the only realistic cause is plan-gating, so reclassify
      // explicitly as FEATURE_GATED with plan-specific guidance. Other
      // not_allowed contexts in this MCA keep the BUSINESS_RULE mapping.
      let result: unknown;
      try {
        result = await wrapSlackMutation(() => client.files.sharedPublicURL({ file: fileId }));
      } catch (err) {
        if (err instanceof SlackApiError && err.upstreamMessage === 'not_allowed') {
          throw new SlackApiError({
            code: 'FEATURE_GATED',
            action: {
              type: 'admin_action',
              description:
                'Public file sharing is disabled on this Slack workspace. The Free plan does not include public file URLs; admins may also disable it on paid plans. Upgrade the plan or have an admin enable public file sharing in workspace settings.',
            },
            retryable: false,
            httpStatus: err.httpStatus,
            upstreamMessage: 'not_allowed',
          });
        }
        throw err;
      }
      return {
        fileId,
        permalinkPublic: (result as any).file?.permalink_public ?? null,
      };
    },
  });
}
