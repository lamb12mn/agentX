import yaml from 'js-yaml';
import { createAsset, getAsset, listAssets, updateAsset, deleteAsset, readAssetContent } from '../store/assets.js';
import { exportAgent } from '../export/claude.js';
import type { AssetMeta, AgentConfig } from '../types.js';

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
 * Agent-related MCP tool definitions
 */
/**
 * Agent-related MCP tool definitions
 */
export interface AgentTools {
  list_agents: ToolHandler<Record<string, never>, AssetMeta[]>;
  get_agent: ToolHandler<{ id: string }, { meta: AssetMeta; config: AgentConfig } | null>;
  create_agent: ToolHandler<{ name: string; description?: string; tags?: string[]; config: AgentConfig }, AssetMeta>;
  update_agent: ToolHandler<{ id: string; name?: string; description?: string; tags?: string[] }, AssetMeta>;
  delete_agent: ToolHandler<{ id: string }, void>;
  export_agent: ToolHandler<{ id: string; output_dir: string }, { claude_md_path: string; settings_json_path: string }>;
}

/**
 * Register agent-related MCP tools (CRUD operations + export)
 * @param baseDir - Base directory for asset file storage
 * @returns Agent tool handlers map
 */
export function registerAgentTools(baseDir: string): AgentTools {
  return {
    list_agents: {
      description: 'List all agents - Returns all agent assets with their metadata',
      inputSchema: {
        type: 'object',
        properties: {},
        description: 'No parameters required. Returns all agent assets.',
      },
      handler: async () => listAssets('agent'),
    },

    get_agent: {
      description: 'Get an agent by id - Returns metadata and parsed AgentConfig YAML',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique agent ID (UUID format)',
          },
        },
        required: ['id'],
        description: 'Retrieves a specific agent by its UUID, including parsed YAML config. Use list_agents to find available agent IDs.',
      },
      handler: async ({ id }) => {
        const meta = await getAsset(id);
        if (!meta) return null;
        const content = await readAssetContent(id);
        let config: AgentConfig;
        try {
          config = yaml.load(content) as AgentConfig;
        } catch {
          throw new Error(`Failed to parse agent config for id: ${id}`);
        }
        return { meta, config };
      },
    },

    create_agent: {
      description: 'Create a new agent - Creates and registers a new agent with YAML config',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Agent name (required, max 100 chars)',
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
            description: 'Agent configuration object with: name, version, description?, role_prompt?, rules[], skills[], mcps[], workflow?',
          },
        },
        required: ['name', 'config'],
        description: 'Creates a new agent. The config must include: name (string), version (string). Optional: description, role_prompt, rules, skills, mcps, workflow.',
      },
      handler: async ({ name, description, tags, config }) => {
        const content = yaml.dump(config);
        return createAsset({ type: 'agent', name, description, tags: tags ?? [] }, content, baseDir);
      },
    },

    update_agent: {
      description: 'Update an agent - Updates agent metadata (name, description, tags)',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique agent ID to update (required)',
          },
          name: {
            type: 'string',
            description: 'New agent name (optional)',
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
        description: 'Updates an existing agent metadata. Only updates name, description, tags - to change config, use export_agent and recreate.',
      },
      handler: async ({ id, name, description, tags }) =>
        updateAsset(id, { name, description, tags }),
    },

    delete_agent: {
      description: 'Delete an agent - Permanently removes an agent from the database',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique agent ID to delete (required, this action cannot be undone)',
          },
        },
        required: ['id'],
        description: 'Permanently deletes an agent. This action cannot be undone - use with caution.',
      },
      handler: async ({ id }) => deleteAsset(id),
    },

    export_agent: {
      description: 'Export an agent - Exports agent to CLAUDE.md + settings.json files',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique agent ID to export (required)',
          },
          output_dir: {
            type: 'string',
            description: 'Output directory path (required, will be created if needed)',
          },
        },
        required: ['id', 'output_dir'],
        description: 'Exports agent to CLAUDE.md (role prompt) and settings.json (MCP servers config) for use with Claude Code CLI.',
      },
      handler: async ({ id, output_dir }) => {
        const meta = await getAsset(id);
        if (!meta) throw new Error(`Agent not found: ${id}`);
        const content = await readAssetContent(id);
        let config: AgentConfig;
        try {
          config = yaml.load(content) as AgentConfig;
        } catch {
          throw new Error(`Failed to parse agent config for id: ${id}`);
        }
        return exportAgent(config, output_dir);
      },
    },
  };
}
