import type { AgentApp } from '@agentapps/sdk';
import {
  pollRequestWithProgress,
  resolveCredentials,
  submitRequest,
} from '../lib/higgsfield-client.js';

/**
 * animate-image — convert an image to video with motion.
 */
export function registerImageToVideoTool(app: AgentApp): void {
  app.tool('animate-image', {
    description:
      'Convert an image to video with motion. Supports various motion styles and camera movements. Params: image_url (required), prompt (required), duration? (seconds, default 5), motion_strength? (0.0-1.0, default 0.5), camera_motion? ("none"|"zoom_in"|"zoom_out"|"pan_left"|"pan_right"|"tilt_up"|"tilt_down"), wait? (default false).',
    parameters: {
      type: 'object',
      properties: {
        image_url: {
          type: 'string',
          description: 'URL of the input image',
        },
        prompt: {
          type: 'string',
          description: 'Description of the desired motion/video',
        },
        duration: {
          type: 'number',
          default: 5,
          description: 'Video duration in seconds (default: 5)',
        },
        motion_strength: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          default: 0.5,
          description: 'Motion intensity (0.0-1.0)',
        },
        camera_motion: {
          type: 'string',
          enum: ['none', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down'],
          default: 'none',
          description: 'Camera movement type',
        },
        wait: {
          type: 'boolean',
          description: 'Wait for completion (default: false)',
          default: false,
        },
      },
      required: ['image_url', 'prompt'],
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
        input_images: [args.image_url],
        prompt: args.prompt,
        duration: (args.duration as number) || 5,
        motions_strength: (args.motion_strength as number) || 0.5,
      };
      if (args.camera_motion && args.camera_motion !== 'none') {
        input.camera_motion = args.camera_motion;
      }

      const result = await submitRequest('higgsfield/dop/image-to-video', input, credentials);

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
