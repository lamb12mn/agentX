import { searchAssets } from '../store/search.js';
import type { AssetType } from '../types.js';
import type { SearchResult } from '../store/search.js';

interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

export interface SearchTools {
  search_assets: ToolHandler<
    { query: string; type?: AssetType; limit?: number },
    SearchResult[]
  >;
}

export function registerSearchTools(): SearchTools {
  return {
    search_assets: {
      description: 'Search assets - Full-text search across all assets by name, description, and content',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search keywords (required, min 2 chars, max 100 chars)',
          },
          type: {
            type: 'string',
            enum: ['skill', 'mcp', 'prompt', 'rule', 'workflow', 'agent'],
            description: 'Optional: filter by asset type. If not specified, searches all types.',
          },
          limit: {
            type: 'integer',
            default: 20,
            description: 'Maximum number of results to return (1-100, default: 20)',
          },
        },
        required: ['query'],
        description: 'Performs full-text search (FTS5) across assets. Searches name, description, and file content. Use specific types for faster results.',
      },
      handler: async ({ query, type, limit }) => searchAssets(query, type, limit),
    },
  };
}
