import yaml from 'js-yaml';
import { createAsset, getAsset, listAssets, updateAsset, deleteAsset, readAssetContent } from '../store/assets.js';
import type { AssetMeta, McpConfig } from '../types.js';

interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

/**
 * MCP server-related MCP tool definitions
 */
export interface McpTools {
  list_mcps: ToolHandler<Record<string, never>, AssetMeta[]>;
  get_mcp: ToolHandler<{ id: string }, { meta: AssetMeta; config: McpConfig } | null>;
  create_mcp: ToolHandler<{ name: string; description?: string; tags?: string[]; config: McpConfig }, AssetMeta>;
  update_mcp: ToolHandler<{ id: string; name?: string; description?: string; tags?: string[] }, AssetMeta>;
  delete_mcp: ToolHandler<{ id: string }, void>;
}

/**
 * Register MCP server-related MCP tools (CRUD operations for MCP configs)
 * @param baseDir - Base directory for asset file storage
 * @returns MCP tool handlers map
 */
export function registerMcpTools(baseDir: string): McpTools {
  return {
    list_mcps: {
      description: 'List all MCP servers - Returns all MCP server configuration assets',
      inputSchema: {
        type: 'object',
        properties: {},
        description: 'No parameters required. Returns all MCP server assets.',
      },
      handler: async () => listAssets('mcp'),
    },

    get_mcp: {
      description: 'Get an MCP server by id - Returns metadata and parsed McpConfig',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique MCP server ID (UUID format)',
          },
        },
        required: ['id'],
        description: 'Retrieves a specific MCP server by its UUID, including parsed YAML config. Use list_mcps to find available IDs.',
      },
      handler: async ({ id }) => {
        const meta = await getAsset(id);
        if (!meta) return null;
        const content = await readAssetContent(id);
        let config: McpConfig;
        try {
          config = yaml.load(content) as McpConfig;
        } catch {
          throw new Error(`Failed to parse MCP config for id: ${id}`);
        }
        return { meta, config };
      },
    },

    create_mcp: {
      description: 'Create a new MCP server - Creates and registers a new MCP server config',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'MCP server name (required, max 100 chars)',
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
          config: {
            type: 'object',
            description: 'MCP configuration with: name, command, args?, env?, enabled',
          },
        },
        required: ['name', 'config'],
        description: 'Creates a new MCP server config. The config must include: name (string), command (string). Optional: args, env, enabled.',
      },
      handler: async ({ name, description, tags, config }) => {
        const content = yaml.dump(config);
        return createAsset({ type: 'mcp', name, description, tags: tags ?? [] }, content, baseDir);
      },
    },

    update_mcp: {
      description: 'Update an MCP server - Updates MCP server metadata',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique MCP server ID to update (required)',
          },
          name: {
            type: 'string',
            description: 'New MCP server name (optional)',
          },
          description: {
            type: 'string',
            description: 'New description (optional)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'New tags array (optional)',
          },
        },
        required: ['id'],
        description: 'Updates an existing MCP server metadata. Only updates name, description, tags.',
      },
      handler: async ({ id, name, description, tags }) =>
        updateAsset(id, { name, description, tags }),
    },

    delete_mcp: {
      description: 'Delete an MCP server - Permanently removes an MCP server from the database',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique MCP server ID to delete (required, this action cannot be undone)',
          },
        },
        required: ['id'],
        description: 'Permanently deletes an MCP server. This action cannot be undone - use with caution.',
      },
      handler: async ({ id }) => deleteAsset(id),
    },
  };
}
