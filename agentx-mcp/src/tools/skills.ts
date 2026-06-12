import { createAsset, getAsset, listAssets, updateAsset, deleteAsset } from '../store/assets.js';
import type { AssetMeta } from '../types.js';
import { validateCreateAssetInput, validateUpdateAssetInput, validateDeleteAssetInput, formatValidationResult } from '../utils/validation.js';
import { formatError } from '../utils/errors.js';

/**
 * Handler interface for MCP tool registration
 * @template TInput - The input parameter type
 * @template TOutput - The return type
 */
interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

/**
 * Skill-related MCP tool definitions
 */
interface SkillTools {
  list_skills: ToolHandler<Record<string, never>, AssetMeta[]>;
  get_skill: ToolHandler<{ id: string }, AssetMeta | null>;
  create_skill: ToolHandler<
    { name: string; content: string; description?: string; tags: string[] },
    AssetMeta
  >;
  update_skill: ToolHandler<
    { id: string; name?: string; description?: string; tags?: string[]; content?: string },
    AssetMeta
  >;
  delete_skill: ToolHandler<{ id: string }, void>;
}

/**
 * Register skill-related MCP tools (CRUD operations for skills)
 * @param baseDir - Base directory for asset file storage
 * @returns Skill tool handlers map
 */
export function registerSkillTools(baseDir: string): SkillTools {
  return {
    list_skills: {
      description: 'List all skills - Returns all skill assets in the database with their metadata',
      inputSchema: {
        type: 'object',
        properties: {},
        description: 'No parameters required. Returns all skill assets.',
      },
      handler: async () => listAssets('skill'),
    },

    get_skill: {
      description: 'Get a skill by id - Returns a single skill asset by its unique identifier',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique skill ID (UUID format)',
          },
        },
        required: ['id'],
        description: 'Retrieves a specific skill by its UUID. Use list_skills to find available skill IDs.',
      },
      handler: async ({ id }) => getAsset(id),
    },

    create_skill: {
      description: 'Create a new skill - Creates and registers a new skill asset',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Skill name (required, max 100 chars, letters/numbers/underscores/hyphens)',
          },
          content: {
            type: 'string',
            description: 'Skill content in markdown format (required)',
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
        description: 'Creates a new skill asset with name, content, optional description and tags.',
      },
      handler: async ({ name, content, description, tags }) =>
        createAsset({ type: 'skill', name, description, tags: tags ?? [] }, content, baseDir),
    },

    update_skill: {
      description: 'Update a skill - Updates skill metadata and/or content',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique skill ID to update (required)',
          },
          name: {
            type: 'string',
            description: 'New skill name (optional)',
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
            description: 'New skill content in markdown (optional)',
          },
        },
        required: ['id'],
        description: 'Updates an existing skill. All fields except id are optional - only provided fields will be updated.',
      },
      handler: async ({ id, name, description, tags, content }: { id: string; name?: string; description?: string; tags?: string[]; content?: string }) =>
        updateAsset(id, { name, description, tags, content }),
    },

    delete_skill: {
      description: 'Delete a skill - Permanently removes a skill from the database',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique skill ID to delete (required, this action cannot be undone)',
          },
        },
        required: ['id'],
        description: 'Permanently deletes a skill. This action cannot be undone - use with caution.',
      },
      handler: async ({ id }) => deleteAsset(id),
    },
  };
}
