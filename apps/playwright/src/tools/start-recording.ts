import type { AgentApp } from '@agentapps/sdk';
import {
  attachPageListeners,
  ensureBrowser,
  getContext,
  getPage,
  setContext,
  setIsRecording,
  setPage,
} from '../browser.js';

export function registerStartRecordingTool(app: AgentApp): void {
  app.tool('start-recording', {
    description:
      'Start recording a video of the browser. Creates a new browser context with video recording enabled. Use stop-recording to finalize the video — it is stored in the workspace file area and its URL is returned. All navigation and interaction tools will be captured in the recording.',
    parameters: {
      type: 'object',
      properties: {
        width: {
          type: 'number',
          default: 1280,
          description: 'Video width in pixels (default: 1280)',
        },
        height: {
          type: 'number',
          default: 720,
          description: 'Video height in pixels (default: 720)',
        },
      },
    },
    // Replaces the app's own browser context; the video is staged in the OS temp directory
    // until stop-recording moves it to the app's Objects. Nothing outside the app changes.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args) => {
      const fs = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const width = (args.width as number) || 1280;
      const height = (args.height as number) || 720;

      // Playwright needs a real local directory while recording; the final
      // video is published through the Files capability on stop-recording.
      const outputDir = join(tmpdir(), 'agentapps-playwright', 'videos');
      await fs.mkdir(outputDir, { recursive: true });

      // Close existing page and context if any
      const currentPage = getPage();
      if (currentPage && !currentPage.isClosed()) {
        await currentPage.close();
        setPage(null);
      }
      const currentContext = getContext();
      if (currentContext) {
        try {
          await currentContext.close();
        } catch {}
        setContext(null);
      }

      // Create new context with video recording
      const { context: newContext } = await ensureBrowser({
        recordVideo: { dir: outputDir, size: { width, height } },
        viewport: { width, height },
      });

      // Create a new page in the recording context
      const newPage = await newContext.newPage();
      setPage(newPage);

      // Re-attach event listeners
      attachPageListeners(newPage);

      setIsRecording(true);

      return `Video recording started (${width}x${height}). Call stop-recording to finalize and get the video URL.`;
    },
  });
}
