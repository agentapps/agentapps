import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient } from '../lib/index.js';

const BYTES_PER_GB = 1024 ** 3;

function toGB(bytes?: number): string | undefined {
  if (typeof bytes !== 'number') return undefined;
  return (bytes / BYTES_PER_GB).toFixed(2);
}

/** get-drive-info — GET /me/drive. */
export function registerGetDriveInfoTool(app: AgentApp): void {
  app.tool('get-drive-info', {
    description: 'Get information about the OneDrive account, including storage quota and usage.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const drive = await graphRequest<Record<string, any>>('GET', '/me/drive');

      return {
        account: email,
        id: drive.id,
        driveType: drive.driveType,
        owner: drive.owner?.user?.displayName,
        quota: {
          totalGB: toGB(drive.quota?.total),
          usedGB: toGB(drive.quota?.used),
          remainingGB: toGB(drive.quota?.remaining),
          state: drive.quota?.state,
        },
      };
    },
  });
}
