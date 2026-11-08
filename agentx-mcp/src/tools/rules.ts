import { createAsset, getAsset, listAssets, updateAsset, deleteAsset, readAssetContent } from '../store/assets.js';
import type { AssetMeta } from '../types.js';
import { autoMatchBuiltin } from '../builtin-prompts/library.js';

interface MatchedBuiltin {
  id: string;
  title: string;
  score: number;
}

interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

/**
 * Rule-related MCP tool definitions
 */
export interface RuleTools {
  list_rules: ToolHandler<Record<string, never>, AssetMeta[]>;
  get_rule: ToolHandler<{ id: string }, { meta: AssetMeta; content: string } | null>;
  create_rule: ToolHandler<{ name: string; content?: string; intent?: string; description?: string; tags?: string[] }, AssetMeta & { matchedBuiltin?: MatchedBuiltin }>;
  update_rule: ToolHandler<{ id: string; name?: string; description?: string; tags?: string[]; content?: string }, AssetMeta>;
  delete_rule: ToolHandler<{ id: string }, void>;
}

/**
 * Register rule-related MCP tools (CRUD operations for rules)
 * @param baseDir - Base directory for asset file storage
 * @returns Rule tool handlers map
 */
export function registerRuleTools(baseDir: string): RuleTools {
  return {
    list_rules: {
      description: 'List all rules - Returns all rule assets with their metadata',
      inputSchema: {
        type: 'object',
        properties: {},
        description: 'No parameters required. Returns all rule assets.',
      },
      handler: async () => listAssets('rule'),
    },

    get_rule: {
      description: 'Get a rule by id - Returns metadata and raw content',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique rule ID (UUID format)',
          },
        },
        required: ['id'],
        description: 'Retrieves a specific rule by its UUID, including raw content. Use list_rules to find available rule IDs.',
      },
      handler: async ({ id }) => {
        const meta = await getAsset(id);
        if (!meta) return null;
        const content = await readAssetContent(id);
        return { meta, content };
      },
    },

    create_rule: {
      description: 'Create a new rule - Creates and registers a new rule asset',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Rule name (required, max 100 chars, letters/numbers/underscores/hyphens)',
          },
          content: {
            type: 'string',
            description: 'Rule content in markdown format (required unless intent is provided)',
          },
          intent: {
            type: 'string',
            description: 'Natural-language intent; when content is omitted, the best matching built-in prompt is applied automatically',
          },
          description: {
            type: 'string',
            description: 'Optional description (max 500 chars)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tags for categorization',
          },
        },
        required: ['name'],
        description: 'Creates a new rule asset. Provide content, or intent for automatic built-in prompt matching.',
      },
      handler: async ({ name, content, intent, description, tags }) => {
        let body = content ?? '';
        let matchedBuiltin: MatchedBuiltin | undefined;
        if (!body && intent) {
          const matched = autoMatchBuiltin(intent);
          if (!matched) throw new Error(`No reliable built-in prompt match for "${intent}". Provide content explicitly, or use match_builtin_prompts.`);
          body = matched.text;
          matchedBuiltin = { id: matched.id, title: matched.title, score: matched.score };
        }
        if (!body) throw new Error('content or intent is required');
        const meta = await createAsset({ type: 'rule', name, description, tags: tags ?? [] }, body, baseDir);
        return { ...meta, ...(matchedBuiltin ? { matchedBuiltin } : {}) };
      },
    },

    update_rule: {
      description: 'Update a rule - Updates rule metadata and/or content',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique rule ID to update (required)',
          },
          name: {
            type: 'string',
            description: 'New rule name (optional)',
          },
          description: {
            type: 'string',
            description: 'New description (optional)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'New tags array (optional, replaces existing)',
          },
          content: {
            type: 'string',
            description: 'New rule content (optional)',
          },
        },
        required: ['id'],
        description: 'Updates an existing rule. All fields except id are optional - only provided fields will be updated.',
      },
      handler: async ({ id, name, description, tags, content }) =>
        updateAsset(id, { name, description, tags, content }),
    },

    delete_rule: {
      description: 'Delete a rule - Permanently removes a rule from the database',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique rule ID to delete (required, this action cannot be undone)',
          },
        },
        required: ['id'],
        description: 'Permanently deletes a rule. This action cannot be undone - use with caution.',
      },
      handler: async ({ id }) => deleteAsset(id),
    },
  };
}
