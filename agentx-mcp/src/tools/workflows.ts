import { createAsset, getAsset, listAssets, updateAsset, deleteAsset, readAssetContent } from '../store/assets.js';
import type { AssetMeta } from '../types.js';

interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

export interface WorkflowTools {
  list_workflows: ToolHandler<Record<string, never>, AssetMeta[]>;
  get_workflow: ToolHandler<{ id: string }, { meta: AssetMeta; content: string } | null>;
  create_workflow: ToolHandler<{ name: string; content: string; description?: string; tags?: string[] }, AssetMeta>;
  update_workflow: ToolHandler<{ id: string; name?: string; description?: string; tags?: string[]; content?: string }, AssetMeta>;
  delete_workflow: ToolHandler<{ id: string }, void>;
}

export function registerWorkflowTools(baseDir: string): WorkflowTools {
  return {
    list_workflows: {
      description: 'List all workflows - Returns all workflow assets with their metadata',
      inputSchema: {
        type: 'object',
        properties: {},
        description: 'No parameters required. Returns all workflow assets.',
      },
      handler: async () => listAssets('workflow'),
    },

    get_workflow: {
      description: 'Get a workflow by id - Returns metadata and raw content',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique workflow ID (UUID format)',
          },
        },
        required: ['id'],
        description: 'Retrieves a specific workflow by its UUID, including raw content. Use list_workflows to find available IDs.',
      },
      handler: async ({ id }) => {
        const meta = await getAsset(id);
        if (!meta) return null;
        const content = await readAssetContent(id);
        return { meta, content };
      },
    },

    create_workflow: {
      description: 'Create a new workflow - Creates and registers a new workflow asset',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Workflow name (required, max 100 chars, letters/numbers/underscores/hyphens)',
          },
          content: {
            type: 'string',
            description: 'Workflow content in YAML format (required)',
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
        description: 'Creates a new workflow asset with name and content.',
      },
      handler: async ({ name, content, description, tags }) =>
        createAsset({ type: 'workflow', name, description, tags: tags ?? [] }, content, baseDir),
    },

    update_workflow: {
      description: 'Update a workflow - Updates workflow metadata and/or content',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique workflow ID to update (required)',
          },
          name: {
            type: 'string',
            description: 'New workflow name (optional)',
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
            description: 'New workflow content (optional)',
          },
        },
        required: ['id'],
        description: 'Updates an existing workflow. All fields except id are optional - only provided fields will be updated.',
      },
      handler: async ({ id, name, description, tags, content }) =>
        updateAsset(id, { name, description, tags, content }),
    },

    delete_workflow: {
      description: 'Delete a workflow - Permanently removes a workflow from the database',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique workflow ID to delete (required, this action cannot be undone)',
          },
        },
        required: ['id'],
        description: 'Permanently deletes a workflow. This action cannot be undone - use with caution.',
      },
      handler: async ({ id }) => deleteAsset(id),
    },
  };
}
