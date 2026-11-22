/**
 * send_notification — send a smart push notification to iOS devices.
 *
 * Image support (iOS UNNotificationAttachment constraints):
 *   - Supported formats: JPEG, PNG, GIF.
 *   - NOT supported: WebP, SVG, TIFF.
 *   - Maximum file size: 10 MB.
 *   - Recommended aspect ratios: 1:1, 4:3, 3:2, 2:1.
 *   - When generating images with Replicate, request output_format "png"
 *     or "jpg" — the default "webp" will NOT display on iOS.
 *
 * Two ways to attach an image:
 *   - `image`: a direct URL to a JPEG/PNG/GIF file.
 *   - `imageData`: base64-encoded image data (overrides `image`).
 *
 * Dynamic content (title, text, image) requires Pushcut Pro.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, pushcutRequest, resolveApiKey } from '../types.js';

export function registerSendNotificationTool(app: AgentApp): void {
  app.tool('send_notification', {
    description:
      'Send a smart push notification to your iOS devices via Pushcut. ' +
      'You must specify the notification name (as configured in the Pushcut app). ' +
      'Optionally override the title, text, image, sound, and attach action buttons. ' +
      'Images must be JPEG, PNG, or GIF (WebP and SVG are not supported by iOS). Max 10 MB.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The notification name as defined in the Pushcut app.',
        },
        title: {
          type: 'string',
          description: 'Override the notification title.',
        },
        text: {
          type: 'string',
          description: 'Override the notification body text.',
        },
        input: {
          type: 'string',
          description: 'Input value passed to the notification actions.',
        },
        image: {
          type: 'string',
          description:
            'URL of an image to display in the notification. Supported formats: JPEG, PNG, GIF. ' +
            'WebP and SVG are NOT supported (iOS limitation). Max 10 MB.',
        },
        imageData: {
          type: 'string',
          description:
            'Base64-encoded image data (JPEG, PNG, or GIF). Overrides the image field if both are provided.',
        },
        url: {
          type: 'string',
          description:
            'URL to open when the notification is tapped. Can be any URL — a web link, a deep link, etc.',
        },
        sound: {
          type: 'string',
          description: 'Sound name for the notification.',
        },
        devices: {
          type: 'array',
          items: { type: 'string' },
          description: 'Limit delivery to specific device names. If omitted, sends to all devices.',
        },
      },
      required: ['name'],
    },
    // Sends a push notification to the user's devices: a sent notification cannot be recalled.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const apiKey = await resolveApiKey(ctx);

      const name = args.name as string;
      ctx.log('info', `Sending notification: ${name}`);

      const body: Record<string, unknown> = {};
      if (args.title) body.title = args.title;
      if (args.text) body.text = args.text;
      if (args.input) body.input = args.input;
      if (args.image) body.image = args.image;
      if (args.imageData) body.imageData = args.imageData;
      if (args.url) body.defaultAction = { name: 'Open', url: args.url };
      if (args.sound) body.sound = args.sound;
      if (args.devices) body.devices = args.devices;

      const response = await pushcutRequest(`/notifications/${encodeURIComponent(name)}`, apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await assertOk(response);

      return { sent: true, notification: name };
    },
  });
}
