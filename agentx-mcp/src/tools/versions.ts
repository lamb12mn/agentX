import { z } from 'zod';
import {
  createVersionSnapshot,
  listVersions,
  getVersion,
  rollbackToVersion,
  clearVersions,
  getVersionStats,
} from '../store/versions.js';
import { getAsset } from '../store/assets.js';
import type { ToolHandler } from './common.js';

export function registerVersionTools(): {
  create_version_snapshot: ToolHandler<{ assetId: string; createdBy?: string }, { version: number; message: string }>;
  list_versions: ToolHandler<{ assetId: string }, Array<{
    version: number;
    created_at: string;
    created_by?: string;
    snapshot_preview: { name: string; tags: string[] };
  }>>;
  get_version: ToolHandler<{ assetId: string; version: number }, {
    version: number;
    meta: Record<string, unknown>;
    content: string;
    created_at: string;
    created_by?: string;
  }>;
  rollback_to_version: ToolHandler<{ assetId: string; version: number }, { success: boolean; message: string }>;
  clear_versions: ToolHandler<{ assetId: string }, { deleted: number; message: string }>;
  version_stats: ToolHandler<{ assetId: string }, { total: number; latest: number; firstCreatedAt: string | null }>;
} {
  return {
    create_version_snapshot: {
      description: 'Create a version snapshot of an asset',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            description: 'Asset ID to snapshot',
          },
          createdBy: {
            type: 'string',
            description: 'Optional creator identifier for audit trail',
          },
        },
        required: ['assetId'],
      },
      handler: async ({ assetId, createdBy }) => {
        const version = await createVersionSnapshot(assetId, createdBy);
        return { version, message: `Snapshot created: version ${version}` };
      },
    },

    list_versions: {
      description: 'List all version snapshots for an asset',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            description: 'Asset ID',
          },
        },
        required: ['assetId'],
      },
      handler: async ({ assetId }) => {
        const versions = listVersions(assetId);
        return versions.map(v => ({
          version: v.version,
          created_at: v.created_at,
          created_by: v.created_by,
          snapshot_preview: {
            name: v.snapshot_data.meta.name,
            tags: v.snapshot_data.meta.tags,
          },
        }));
      },
    },

    get_version: {
      description: 'Get a specific version snapshot',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            description: 'Asset ID',
          },
          version: {
            type: 'number',
            description: 'Version number to retrieve',
          },
        },
        required: ['assetId', 'version'],
      },
      handler: async ({ assetId, version }) => {
        const v = getVersion(assetId, version);
        if (!v) {
          throw new Error(`Version ${version} not found for asset ${assetId}`);
        }
        return {
          version: v.version,
          meta: v.snapshot_data.meta as Record<string, unknown>,
          content: v.snapshot_data.content,
          created_at: v.created_at,
          created_by: v.created_by,
        };
      },
    },

    rollback_to_version: {
      description: 'Rollback an asset to a specific version',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            description: 'Asset ID to rollback',
          },
          version: {
            type: 'number',
            description: 'Target version number',
          },
        },
        required: ['assetId', 'version'],
      },
      handler: async ({ assetId, version }) => {
        try {
          const result = await rollbackToVersion(assetId, version);
          return { success: true, message: `Rolled back to version ${version}`, asset: result };
        } catch (error) {
          return { success: false, message: error instanceof Error ? error.message : String(error) };
        }
      },
    },

    clear_versions: {
      description: 'Clear all version history for an asset',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            description: 'Asset ID to clear versions for',
          },
        },
        required: ['assetId'],
      },
      handler: async ({ assetId }) => {
        const deleted = clearVersions(assetId);
        return { deleted, message: `Cleared ${deleted} version(s)` };
      },
    },

    version_stats: {
      description: 'Get version statistics for an asset',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            description: 'Asset ID',
          },
        },
        required: ['assetId'],
      },
      handler: async ({ assetId }) => {
        return getVersionStats(assetId);
      },
    },
  };
}
