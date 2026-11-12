/**
 * Research Assistant — Agent App demo with stdio transport.
 *
 * A real child-process app that demonstrates:
 * - Multiple tools with typed parameters
 * - Progress reporting
 * - Streaming results
 * - Health check with dependency validation
 * - Cancellation support
 *
 * Runs as: node src/main.ts  (stdio transport)
 * Tested by: test/demo.ts   (spawns child process via LocalProcessRuntime)
 */

import { createApp } from '@agentapps/sdk';

// ---------------------------------------------------------------------------
// Mock "database" for notes
// ---------------------------------------------------------------------------

const notesDb = new Map<string, { title: string; content: string; createdAt: string }>();

// ---------------------------------------------------------------------------
// Create the app
// ---------------------------------------------------------------------------

const app = createApp({ id: 'app.research', version: '1.0.0' });

// ---------------------------------------------------------------------------
// Tool: search
// ---------------------------------------------------------------------------

app.tool('search', {
  description: 'Search the web for information on a topic. Returns top results with summaries.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      limit: {
        type: 'number',
        description: 'Max results (default: 3, max: 10)',
      },
    },
    required: ['query'],
  },
  annotations: { readOnlyHint: true },
  handler: async (args, ctx) => {
    const query = args.query as string;
    const limit = Math.min((args.limit as number) ?? 3, 10);

    ctx.log('info', `Searching for: "${query}"`, { limit });

    // Simulate search delay with progress
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      if (ctx.signal.aborted) {
        ctx.log('warn', 'Search cancelled');
        return { cancelled: true };
      }
      ctx.progress(Math.round((i / steps) * 100), `Searching... step ${i + 1}/${steps}`);
      await new Promise((r) => setTimeout(r, 80));
    }

    ctx.progress(100, 'Search complete');

    // Mock results
    const results = [
      {
        title: `${query} — Wikipedia`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query.replace(/\s+/g, '_'))}`,
        summary: `Wikipedia article about ${query}. Comprehensive overview with history, key concepts, and related topics.`,
      },
      {
        title: `${query} — Latest News`,
        url: `https://news.example.com/${encodeURIComponent(query)}`,
        summary: `Recent developments and news coverage about ${query}. Updated hourly with breaking stories.`,
      },
      {
        title: `${query} — Research Paper`,
        url: `https://arxiv.org/search/?query=${encodeURIComponent(query)}`,
        summary: `Academic papers and preprints related to ${query}. Peer-reviewed sources with citations.`,
      },
      {
        title: `${query} — Tutorial`,
        url: `https://tutorial.example.com/${encodeURIComponent(query)}`,
        summary: `Step-by-step tutorial and guide for ${query}. Beginner-friendly with examples.`,
      },
      {
        title: `${query} — Community Discussion`,
        url: `https://forum.example.com/t/${encodeURIComponent(query)}`,
        summary: `Community forum discussions about ${query}. Real-world experiences and Q&A.`,
      },
    ].slice(0, limit);

    return {
      query,
      results,
      totalResults: results.length * 3, // simulate more results available
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: summarize
// ---------------------------------------------------------------------------

app.tool('summarize', {
  description: 'Summarize a long text into key points. Returns bullet-point summary.',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to summarize',
      },
      maxPoints: {
        type: 'number',
        description: 'Max bullet points (default: 3, max: 10)',
      },
    },
    required: ['text'],
  },
  annotations: { readOnlyHint: true },
  handler: async (args, ctx) => {
    const text = args.text as string;
    const maxPoints = Math.min((args.maxPoints as number) ?? 3, 10);

    ctx.log('info', `Summarizing ${text.length} chars`, { maxPoints });

    // Simple extraction-based "summarization" (demo quality)
    const sentences = text
      .replace(/[.!?]+/g, '.')
      .split('.')
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    const keyPoints = sentences.slice(0, maxPoints).map((s) => `${s}.`);

    // If text is too short, generate synthetic points
    while (keyPoints.length < Math.min(2, maxPoints)) {
      keyPoints.push('The text discusses core concepts and their implications.');
    }

    ctx.progress(50, 'Analyzing text...');
    await new Promise((r) => setTimeout(r, 50));
    ctx.progress(100, 'Summary ready');

    return {
      originalLength: text.length,
      summaryLength: keyPoints.join(' ').length,
      keyPoints,
      wordCount: text.split(/\s+/).length,
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: save_note
// ---------------------------------------------------------------------------

app.tool('save_note', {
  description: 'Save a note to the research database. Returns the note ID.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Note title',
      },
      content: {
        type: 'string',
        description: 'Note content (markdown supported)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization',
      },
    },
    required: ['title', 'content'],
  },
  handler: async (args, ctx) => {
    const title = args.title as string;
    const content = args.content as string;
    const tags = (args.tags as string[]) ?? [];

    const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const note = {
      title,
      content,
      tags,
      createdAt: new Date().toISOString(),
    };

    notesDb.set(id, note);
    ctx.log('info', `Saved note: "${title}" (${id})`, { tags });

    return {
      id,
      title,
      tags,
      createdAt: note.createdAt,
      totalNotes: notesDb.size,
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: list_notes
// ---------------------------------------------------------------------------

app.tool('list_notes', {
  description: 'List all saved research notes.',
  parameters: {
    type: 'object',
    properties: {},
  },
  annotations: { readOnlyHint: true },
  handler: async (_args, ctx) => {
    ctx.log('info', `Listing ${notesDb.size} notes`);

    const notes = Array.from(notesDb.entries()).map(([id, note]) => ({
      id,
      ...note,
      preview: note.content.slice(0, 100) + (note.content.length > 100 ? '...' : ''),
    }));

    return { notes, count: notes.length };
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');

  // Check if we can "access" the mock database
  const dbSize = notesDb.size;
  const issues = [];

  if (dbSize > 1000) {
    issues.push({
      code: 'DB_SIZE_WARNING',
      message: `Database has ${dbSize} notes, consider archiving`,
      severity: 'warning' as const,
    });
  }

  return {
    status: issues.length > 0 ? 'degraded' : 'ready',
    message: issues.length > 0 ? 'Operating with warnings' : 'Research assistant ready',
    issues: issues.length > 0 ? issues : undefined,
    uptime: Math.floor(process.uptime()),
    notesInDb: dbSize,
  };
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const factory = app.toFactory();
export default factory;
