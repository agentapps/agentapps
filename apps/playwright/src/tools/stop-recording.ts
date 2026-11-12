import type { AgentApp } from '@agentapps/sdk';
import {
  ensureBrowser,
  getContext,
  getIsRecording,
  getPage,
  setContext,
  setIsRecording,
  setPage,
  setVideoPath,
} from '../browser.js';

export function registerStopRecordingTool(app: AgentApp): void {
  app.tool('stop-recording', {
    description:
      'Stop recording and save the video. Closes the current browser context (which finalizes the video), stores the .webm as an object, and returns a link valid for one hour. A new non-recording context is created automatically so the browser remains usable.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description:
            'Optional custom filename for the video (e.g., "gmail-tutorial.webm"). If not provided, Playwright auto-generates a name.',
        },
      },
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      if (!getIsRecording() || !getContext()) {
        return 'No active recording to stop.';
      }

      const fs = await import('node:fs/promises');
      const pathModule = await import('node:path');

      // Get the video path before closing the context
      const currentPage = getPage();
      const video = currentPage?.video();

      // Close the page first
      if (currentPage && !currentPage.isClosed()) {
        await currentPage.close();
        setPage(null);
      }

      // Close the context — this finalizes the video file
      const tempPath = await video?.path();
      const currentContext = getContext();
      await currentContext?.close();
      setContext(null);
      setIsRecording(false);

      let savedName: string | null = null;
      let signedUrl: string | null = null;
      if (tempPath) {
        let targetName = pathModule.basename((args.filename as string) || tempPath);
        if (!targetName.endsWith('.webm')) {
          targetName += '.webm';
        }

        // Store as an object, then drop the local staging file.
        const content = await fs.readFile(tempPath);
        const object = await ctx.objects.put(content, {
          contentType: 'video/webm',
          filename: targetName,
        });
        await fs.rm(tempPath, { force: true });
        savedName = targetName;
        const signed = await ctx.objects.link(object.objectId, { expiresIn: 3600 });
        signedUrl = signed.url;
        setVideoPath(object.objectId);
      }

      // Create a fresh non-recording context so the browser stays usable
      await ensureBrowser();

      if (savedName) {
        return {
          output: `Video saved as ${savedName} — ${signedUrl}`,
          videoPath: savedName,
          videoUrl: signedUrl,
        };
      }

      return 'Recording stopped but video path could not be determined.';
    },
  });
}
