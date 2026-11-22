import type { AgentApp } from '@agentapps/sdk';
import { spawnCommand } from '../spawn.js';

/** @spec VOL-REQ-5 runs commands in the mounted Workspace Volume by default. */
export function registerBashTool(app: AgentApp): void {
  app.tool('bash', {
    description:
      'Execute a bash command with timeout and working directory support. Returns stdout, stderr, and exit code.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command to execute.' },
        description: {
          type: 'string',
          description: 'A 5-10 word description of what this command does.',
        },
        cwd: {
          type: 'string',
          description:
            'Working directory (default: the Workspace Volume when mounted, else the current directory).',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 120000 / 2 min, max: 600000 / 10 min).',
        },
      },
      required: ['command', 'description'],
    },
    // Runs an arbitrary shell command on the user's machine: annotated for the worst a
    // command can do (delete or overwrite files, send data, spend money).
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const command = args.command as string;
      // VOL-REQ-5: the mounted Workspace Volume is the default working directory.
      const cwd = (args.cwd as string) || ctx.volume.mountPath || process.cwd();
      const timeout = args.timeout as number | undefined;

      if (!command) throw new Error('command is required');

      ctx.log('info', `Executing: ${command}`);

      // VOL-REQ-5: the shell sees the mounted Volume as AGENTAPPS_VOLUME_PATH.
      const env = ctx.volume.mountPath
        ? { AGENTAPPS_VOLUME_PATH: ctx.volume.mountPath }
        : undefined;
      const result = await spawnCommand(command, { cwd, timeout, env });

      return {
        stdout: result.stdout || (result.exitCode === 0 ? '(no output)' : ''),
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: `${result.duration}ms`,
        command,
        cwd,
        ...(result.cancelled ? { cancelled: true, signal: result.signal } : {}),
      };
    },
  });
}
