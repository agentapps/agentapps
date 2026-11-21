import { createApp } from '@agentapps/sdk';
import { kelifyRequest } from './lib/kelify-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.kelify',
  version: '2.0.0',
  name: 'Kelify AI Property Search',
  description:
    'AI-powered conversational property search API for real estate listings — search properties through natural language conversations with follow-up questions and full chat history.',
  author: { name: 'Kelify', email: 'contact@kelify.com' },
  license: 'MIT',
  category: 'ai',
  keywords: ['real estate', 'property search', 'ai', 'conversational', 'kelify'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', systemSecrets: ['KELIFY_API_KEY'] },
});

app.health(async (ctx) => {
  // Verify the API key is valid by creating and immediately using a lightweight
  // endpoint. The Kelify API does not have a dedicated /health or /account
  // endpoint, so we validate that the key authenticates successfully by hitting
  // the conversations endpoint (POST creates a conversation, confirming auth).
  await kelifyRequest(ctx, '/v1/conversations', { method: 'POST' });
  return { status: 'ready' as const, message: 'Kelify API key is valid' };
});

registerTools(app);

export const factory = app.toFactory();
