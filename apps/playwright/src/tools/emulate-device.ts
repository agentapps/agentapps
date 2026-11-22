import type { AgentApp } from '@agentapps/sdk';
import {
  attachPageListeners,
  type BrowserOptions,
  DEVICE_PRESETS,
  ensureBrowser,
  getContext,
  getIsRecording,
  getPage,
  setContext,
  setIsRecording,
  setPage,
} from '../browser.js';

export function registerEmulateDeviceTool(app: AgentApp): void {
  app.tool('emulate-device', {
    description:
      'Emulate a specific device or custom viewport. Recreates the browser context with the specified device settings. Useful for recording tutorials on mobile vs desktop views.',
    parameters: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'iphone-13',
            'iphone-15-pro',
            'ipad-pro-11',
            'pixel-7',
            'galaxy-s23',
            'desktop-1080p',
            'desktop-720p',
          ],
          description:
            'Preset device to emulate. Selecting a preset sets viewport, user agent, and touch settings automatically.',
        },
        width: {
          type: 'number',
          description: 'Custom viewport width (used when device is not specified)',
        },
        height: {
          type: 'number',
          description: 'Custom viewport height (used when device is not specified)',
        },
        userAgent: {
          type: 'string',
          description: 'Custom user agent string (used when device is not specified)',
        },
        isMobile: {
          type: 'boolean',
          description: 'Whether to emulate a mobile device (used when device is not specified)',
        },
        hasTouch: {
          type: 'boolean',
          description: 'Whether to enable touch events (used when device is not specified)',
        },
      },
    },
    // Replaces the app's own browser context (the open page is dropped); nothing outside changes.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args) => {
      const device = args.device as string;
      let opts: BrowserOptions;

      if (device && DEVICE_PRESETS[device]) {
        const preset = DEVICE_PRESETS[device];
        opts = {
          viewport: preset.viewport,
          userAgent: preset.userAgent,
          isMobile: preset.isMobile,
          hasTouch: preset.hasTouch,
        };
      } else {
        opts = {
          viewport: {
            width: (args.width as number) || 1280,
            height: (args.height as number) || 720,
          },
          userAgent: args.userAgent as string | undefined,
          isMobile: args.isMobile as boolean | undefined,
          hasTouch: args.hasTouch as boolean | undefined,
        };
      }

      // Close existing page and context
      const currentPage = getPage();
      if (currentPage && !currentPage.isClosed()) {
        await currentPage.close();
        setPage(null);
      }
      const currentContext = getContext();
      if (currentContext) {
        try {
          if (getIsRecording()) {
            await currentContext.close();
            setIsRecording(false);
          } else {
            await currentContext.close();
          }
        } catch {}
        setContext(null);
      }

      // Create new context with device settings
      const { context: newContext } = await ensureBrowser(opts);
      const newPage = await newContext.newPage();
      setPage(newPage);

      // Re-attach event listeners
      attachPageListeners(newPage);

      const deviceName = device || 'custom';
      const viewport = opts.viewport!;
      return `Device emulation set to "${deviceName}" (${viewport.width}x${viewport.height}${opts.isMobile ? ', mobile' : ''}${opts.hasTouch ? ', touch' : ''}).`;
    },
  });
}
