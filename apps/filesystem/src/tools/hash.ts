import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { getDefaultGuard } from '../lib/path-safety.js';

const SUPPORTED_ALGORITHMS = ['sha256', 'sha1', 'md5', 'sha512'] as const;
type Algorithm = (typeof SUPPORTED_ALGORITHMS)[number];

export function registerHashTool(app: AgentApp): void {
  app.tool('hash', {
    description:
      'Compute the cryptographic hash of a file (default sha256). Streams the file so it works on large files.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute or workspace-relative path' },
        algorithm: {
          type: 'string',
          enum: [...SUPPORTED_ALGORITHMS],
          description: 'Hash algorithm (default sha256)',
        },
      },
      required: ['filePath'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args) => {
      const filePath = args.filePath as string;
      if (!filePath) throw new Error('filePath must be a non-empty string');
      const algorithm = ((args.algorithm as string | undefined) ?? 'sha256') as Algorithm;
      if (!SUPPORTED_ALGORITHMS.includes(algorithm)) {
        throw new Error(
          `algorithm must be one of ${SUPPORTED_ALGORITHMS.join(', ')}, got "${algorithm}"`,
        );
      }

      const guard = getDefaultGuard();
      const canonical = guard.resolve(filePath);
      const stat = statSync(canonical);
      if (!stat.isFile()) throw new Error(`Not a regular file: ${canonical}`);

      const hasher = createHash(algorithm);
      await new Promise<void>((resolveStream, rejectStream) => {
        const stream = createReadStream(canonical);
        stream.on('data', (chunk) => hasher.update(chunk));
        stream.on('error', rejectStream);
        stream.on('end', () => resolveStream());
      });

      return {
        file: canonical,
        name: basename(canonical),
        algorithm,
        hash: hasher.digest('hex'),
        size: stat.size,
      };
    },
  });
}
