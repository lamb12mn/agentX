import { getAsset } from '../store/assets.js';
import {
  checkDeleteSafety,
  getDependents,
  getDependencies,
  getDependencyGraph,
  detectCircularDependency,
} from '../store/dependencies.js';
import type { AssetMeta } from '../types.js';
import { createError, ErrorCode } from '../utils/errors.js';

/**
 * 依赖管理MCP工具
 */

export function registerDependencyTools() {
  return {
    check_dependencies: {
      description: 'Check if an asset can be safely deleted (no dependents)',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Asset ID to check',
          },
        },
        required: ['id'],
        description: 'Returns safe: true if no other assets depend on this asset.',
      },
      handler: async ({ id }: { id: string }) => {
        const asset = await getAsset(id);
        if (!asset) {
          throw createError('ASSET_NOT_FOUND', { assetId: id });
        }

        const check = checkDeleteSafety(id);
        return {
          safe: check.safe,
          asset_id: id,
          asset_name: asset.name,
          dependents_count: check.dependents.length,
          dependencies_count: check.dependencies.length,
          dependents: check.dependents,
          dependencies: check.dependencies,
        };
      },
    },

    get_dependents: {
      description: 'Get all assets that depend on the given asset',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Asset ID',
          },
        },
        required: ['id'],
        description: 'Returns list of asset IDs that depend on this asset.',
      },
      handler: async ({ id }: { id: string }) => {
        const asset = await getAsset(id);
        if (!asset) {
          throw createError('ASSET_NOT_FOUND', { assetId: id });
        }

        const dependents = getDependents(id);
        const dependentAssets: AssetMeta[] = [];

        for (const depId of dependents) {
          const depAsset = await getAsset(depId);
          if (depAsset) {
            dependentAssets.push(depAsset);
          }
        }

        return {
          asset_id: id,
          asset_name: asset.name,
          count: dependentAssets.length,
          dependents: dependentAssets,
        };
      },
    },

    get_dependencies: {
      description: 'Get all assets that the given asset depends on',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Asset ID',
          },
        },
        required: ['id'],
        description: 'Returns list of asset IDs that this asset depends on.',
      },
      handler: async ({ id }: { id: string }) => {
        const asset = await getAsset(id);
        if (!asset) {
          throw createError('ASSET_NOT_FOUND', { assetId: id });
        }

        const dependencies = getDependencies(id);
        const dependencyAssets: AssetMeta[] = [];

        for (const depId of dependencies) {
          const depAsset = await getAsset(depId);
          if (depAsset) {
            dependencyAssets.push(depAsset);
          }
        }

        return {
          asset_id: id,
          asset_name: asset.name,
          count: dependencyAssets.length,
          dependencies: dependencyAssets,
        };
      },
    },

    get_dependency_graph: {
      description: 'Get the full dependency graph for an asset (recursive)',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Asset ID',
          },
        },
        required: ['id'],
        description: 'Returns complete dependency graph including transitive dependencies.',
      },
      handler: async ({ id }: { id: string }) => {
        const asset = await getAsset(id);
        if (!asset) {
          throw createError('ASSET_NOT_FOUND', { assetId: id });
        }

        const graph = getDependencyGraph(id);
        return {
          asset_id: id,
          asset_name: asset.name,
          graph,
          total_dependencies: graph.length,
        };
      },
    },

    detect_circular_dependency: {
      description: 'Detect circular dependencies starting from an asset',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Asset ID to start detection from',
          },
        },
        required: ['id'],
        description: 'Returns true if a circular dependency is found.',
      },
      handler: async ({ id }: { id: string }) => {
        const asset = await getAsset(id);
        if (!asset) {
          throw createError('ASSET_NOT_FOUND', { assetId: id });
        }

        const hasCycle = detectCircularDependency(id);
        return {
          asset_id: id,
          asset_name: asset.name,
          has_circular_dependency: hasCycle,
        };
      },
    },
  };
}
