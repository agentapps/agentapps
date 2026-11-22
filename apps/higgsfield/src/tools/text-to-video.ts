import type { AgentApp } from '@agentapps/sdk';
import {
  pollRequestWithProgress,
  resolveCredentials,
  submitRequest,
} from '../lib/higgsfield-client.js';

/**
 * generate-video — generate video from text prompt.
 */
export function registerTextToVideoTool(app: AgentApp): void {
  app.tool('generate-video', {
    description:
      'Generate video from text prompt. Params: prompt (required), duration? (seconds, default 5), resolution? ("720p"|"1080p", default "1080p"), aspect_ratio? ("16:9"|"9:16"|"1:1", default "16:9"), wait? (default false).',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the video to generate',
        },
        duration: {
          type: 'number',
          default: 5,
          description: 'Video duration in seconds (default: 5)',
        },
        resolution: {
          type: 'string',
          enum: ['720p', '1080p'],
          default: '1080p',
          description: 'Output resolution',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['16:9', '9:16', '1:1'],
          default: '16:9',
          description: 'Aspect ratio',
        },
        wait: {
          type: 'boolean',
          description: 'Wait for completion (default: false)',
          default: false,
        },
      },
      required: ['prompt'],
    },
    annotations: {
      readOnlyHint: false,
      // Submits a paid generation: the credits it spends cannot be taken back.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const credentials = await resolveCredentials(ctx);

      const input: Record<string, unknown> = {
        prompt: args.prompt,
        duration: (args.duration as number) || 5,
        resolution: (args.resolution as string) || '1080p',
        aspect_ratio: (args.aspect_ratio as string) || '16:9',
      };

      const result = await submitRequest('kling/v2.6/text-to-video', input, credentials);

      if (args.wait) {
        const completed = (await pollRequestWithProgress(
          result.request_id as string,
          credentials,
        )) as Record<string, unknown>;
        return {
          status: completed.status,
          video: completed.video,
          request_id: completed.request_id,
        };
      }

      return {
        request_id: result.request_id,
        status: result.status,
        status_url: result.status_url,
        cancel_url: result.cancel_url,
        message: 'Request submitted. Use get-prediction to check status.',
      };
    },
  });
}
