import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser } from '../browser.js';

export function registerFileUploadTool(app: AgentApp): void {
  app.tool('file-upload', {
    description: 'Upload one or multiple files',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'The absolute paths to the files to upload. Can be single file or multiple files. If omitted, file chooser is cancelled.',
        },
      },
    },
    // Hands files from the user's machine to a web page, which may upload them at once: a send.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args) => {
      const { page } = await ensureBrowser();
      const paths = args.paths as string[] | undefined;

      // Set up file chooser handler
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 30000 }),
      ]);

      if (paths && paths.length > 0) {
        await fileChooser.setFiles(paths);
        return `Uploaded ${paths.length} file(s): ${paths.join(', ')}`;
      } else {
        await fileChooser.setFiles([]);
        return 'File chooser cancelled';
      }
    },
  });
}
