import {
  builtinStats,
  getBuiltinPrompt,
  listBuiltinPrompts,
  matchBuiltinPrompts,
  renderBuiltinReference,
  type BuiltinPrompt,
} from '../builtin-prompts/library.js';

interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

export interface BuiltinPromptSummary {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: readonly string[];
  type: string;
  promptTextLength: number;
}

export interface BuiltinPromptTools {
  list_builtin_prompts: ToolHandler<
    { type?: string; category?: string; limit?: number },
    { stats: ReturnType<typeof builtinStats>; returned: number; items: BuiltinPromptSummary[] }
  >;
  get_builtin_prompt: ToolHandler<{ id: string }, { item: BuiltinPrompt | null; reference: string | null }>;
  match_builtin_prompts: ToolHandler<
    { query: string; limit?: number; type?: string; category?: string },
    { query: string; selected: string | null; matches: ReturnType<typeof matchBuiltinPrompts>; reference: string | null }
  >;
}

/** Read-only MCP tools over the immutable built-in prompt library. */
export function registerBuiltinPromptTools(): BuiltinPromptTools {
  return {
    list_builtin_prompts: {
      description: 'List immutable built-in prompts (read-only library, not user assets)',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Filter by type: text | image' },
          category: { type: 'string', description: 'Filter by category substring' },
          limit: { type: 'number', description: 'Max items to return (default 30, max 200)' },
        },
        description: 'Returns summaries and capture statistics. The full text is available via get_builtin_prompt.',
      },
      handler: async ({ type, category, limit }) => {
        const all = listBuiltinPrompts().filter(
          (item) => (!type || item.type === type) && (!category || item.category.includes(category)),
        );
        const cap = Math.min(Math.max(limit ?? 30, 1), 200);
        return {
          stats: builtinStats(),
          returned: Math.min(all.length, cap),
          items: all.slice(0, cap).map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            category: item.category,
            tags: item.tags,
            type: item.type,
            promptTextLength: item.promptText.length,
          })),
        };
      },
    },

    get_builtin_prompt: {
      description: 'Get one immutable built-in prompt with its full, untruncated text',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Built-in id (builtin:<slug>) or the bare slug' },
        },
        required: ['id'],
        description: 'Retrieves full promptText, notes, parameters and source metadata. Read-only.',
      },
      handler: async ({ id }) => {
        const item = getBuiltinPrompt(id);
        return { item: item ?? null, reference: item ? renderBuiltinReference(item) : null };
      },
    },

    match_builtin_prompts: {
      description: 'Automatically match built-in prompts to an intent (local, offline weighted matching)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Intent or draft prompt text to match against' },
          limit: { type: 'number', description: 'Max matches (default 5, max 20)' },
          type: { type: 'string', description: 'Restrict to type: text | image' },
          category: { type: 'string', description: 'Restrict to a category substring' },
        },
        required: ['query'],
        description: 'Returns ranked matches, the selected top id, and a ready-to-use reference block.',
      },
      handler: async ({ query, limit, type, category }) => {
        const matches = matchBuiltinPrompts(query, {
          limit: Math.min(Math.max(limit ?? 5, 1), 20),
          type,
          category,
        });
        const top = matches[0] ? getBuiltinPrompt(matches[0].id) : undefined;
        return {
          query,
          selected: top?.id ?? null,
          matches,
          reference: top ? renderBuiltinReference(top) : null,
        };
      },
    },
  };
}
