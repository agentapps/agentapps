import { createApp } from '@agentapps/sdk';
import { getMinioClient } from './lib/minio-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.minio',
  version: '2.0.1',
  name: 'MinIO',
  description:
    'MinIO S3-compatible object storage — manage buckets, upload/download objects, generate presigned URLs.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'storage',
  keywords: ['minio', 's3', 'storage', 'objects', 'buckets', 'files', 'backup'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', systemSecrets: ['ENDPOINT', 'ACCESS_KEY', 'SECRET_KEY'] },
});

app.health(async (ctx) => {
  const client = await getMinioClient(ctx);
  await client.listBuckets();
  return { status: 'ready' as const, message: 'MinIO server is reachable.' };
});

registerTools(app);

export const factory = app.toFactory();
