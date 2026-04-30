import { createAsset, getAsset, listAssets, updateAsset, deleteAsset, readAssetContent } from '../store/assets.js';
import type { AssetMeta } from '../types.js';

interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

export interface PromptTools {
  list_prompts: ToolHandler<Record<string, never>, AssetMeta[]>;
  get_prompt: ToolHandler<{ id: string }, { meta: AssetMeta; content: string } | null>;
  create_prompt: ToolHandler<{ name: string; content: string; description?: string; tags?: string[] }, AssetMeta>;
  update_prompt: ToolHandler<{ id: string; name?: string; description?: string; tags?: string[]; content?: string }, AssetMeta>;
  delete_prompt: ToolHandler<{ id: string }, void>;
}

export function registerPromptTools(baseDir: string): PromptTools {
  return {
    list_prompts: {
      description: 'List all prompts - Returns all prompt assets with their metadata',
      inputSchema: {
        type: 'object',
        properties: {},
        description: 'No parameters required. Returns all prompt assets.',
      },
      handler: async () => listAssets('prompt'),
    },

    get_prompt: {
      description: 'Get a prompt by id - Returns metadata and raw content',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique prompt ID (UUID format)',
          },
        },
        required: ['id'],
        description: 'Retrieves a specific prompt by its UUID, including raw content. Use list_prompts to find available prompt IDs.',
      },
      handler: async ({ id }) => {
        const meta = await getAsset(id);
        if (!meta) return null;
        const content = await readAssetContent(id);
        return { meta, content };
      },
    },

    create_prompt: {
      description: 'Create a new prompt - Creates and registers a new prompt asset',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Prompt name (required, max 100 chars, letters/numbers/underscores/hyphens)',
          },
          content: {
            type: 'string',
            description: 'Prompt content in text format (required)',
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
        required: ['name', 'content'],
        description: 'Creates a new prompt asset with name and content.',
      },
      handler: async ({ name, content, description, tags }) =>
        createAsset({ type: 'prompt', name, description, tags: tags ?? [] }, content, baseDir),
    },

    update_prompt: {
      description: 'Update a prompt - Updates prompt metadata and/or content',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique prompt ID to update (required)',
          },
          name: {
            type: 'string',
            description: 'New prompt name (optional)',
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
            description: 'New prompt content (optional)',
          },
        },
        required: ['id'],
        description: 'Updates an existing prompt. All fields except id are optional - only provided fields will be updated.',
      },
      handler: async ({ id, name, description, tags, content }) =>
        updateAsset(id, { name, description, tags, content }),
    },

    delete_prompt: {
      description: 'Delete a prompt - Permanently removes a prompt from the database',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique prompt ID to delete (required, this action cannot be undone)',
          },
        },
        required: ['id'],
        description: 'Permanently deletes a prompt. This action cannot be undone - use with caution.',
      },
      handler: async ({ id }) => deleteAsset(id),
    },
  };
}
