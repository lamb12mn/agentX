import { batchDeleteAssets, batchAddTags, batchRemoveTags } from '../store/assets.js';
import type { ToolHandler } from './common.js';

interface BatchDeleteInput {
  ids: string[];
  force?: boolean;
  dryRun?: boolean;
}

interface BatchTagInput {
  ids: string[];
  tags: string[];
}

export function registerBatchTools(baseDir: string): {
  batch_delete: ToolHandler<BatchDeleteInput, {
    deleted: string[];
    blocked: string[];
    errors: Array<{ id: string; error: string }>;
  }>;
  batch_tag_add: ToolHandler<BatchTagInput, {
    updated: string[];
    errors: Array<{ id: string; error: string }>;
  }>;
  batch_tag_remove: ToolHandler<BatchTagInput, {
    updated: string[];
    errors: Array<{ id: string; error: string }>;
  }>;
} {
  return {
    batch_delete: {
      description: 'Batch delete multiple assets by IDs with dependency checking',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of asset IDs to delete',
          },
          force: {
            type: 'boolean',
            description: 'Force delete even if assets are dependencies of others (default: false)',
          },
          dryRun: {
            type: 'boolean',
            description: 'Show what would be deleted without actually deleting (default: false)',
          },
        },
        required: ['ids'],
        description: 'Delete multiple assets. Dependency checking prevents deletion of assets that are dependencies of others unless force=true.',
      },
      handler: async ({ ids, force, dryRun }) =>
        batchDeleteAssets(ids, { force, dryRun }),
    },

    batch_tag_add: {
      description: 'Batch add tags to multiple assets',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of asset IDs to modify',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to add to the assets',
          },
        },
        required: ['ids', 'tags'],
        description: 'Add one or more tags to multiple assets. Tags are deduplicated automatically.',
      },
      handler: async ({ ids, tags }) => batchAddTags(ids, tags),
    },

    batch_tag_remove: {
      description: 'Batch remove tags from multiple assets',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of asset IDs to modify',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to remove from the assets',
          },
        },
        required: ['ids', 'tags'],
        description: 'Remove one or more tags from multiple assets.',
      },
      handler: async ({ ids, tags }) => batchRemoveTags(ids, tags),
    },
  };
}
