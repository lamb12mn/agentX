import { cloneAsset } from '../store/assets.js';
import type { ToolHandler } from './common.js';

export function registerCloneTools(baseDir: string): {
  clone_asset: ToolHandler<{ assetId: string; newName?: string }, {
    success: boolean;
    message: string;
    source: { id: string; name: string; type: string };
    cloned: { id: string; name: string; type: string; file_path: string; tags: string[] };
  }>;
} {
  return {
    clone_asset: {
      description: 'Clone an asset to create a duplicate with a new name',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            description: 'ID of the asset to clone',
          },
          newName: {
            type: 'string',
            description: 'Optional new name for the cloned asset (default: "Original Name - Copy")',
          },
        },
        required: ['assetId'],
        description: 'Create a copy of an existing asset. The cloned asset inherits the content, tags, and dependencies of the original.',
      },
      handler: async ({ assetId, newName }) => {
        const cloned = await cloneAsset(assetId, newName, baseDir);
        return {
          success: true,
          message: `Asset cloned successfully: ${cloned.name}`,
          source: { id: cloned.id, name: cloned.name, type: cloned.type },
          cloned: { id: cloned.id, name: cloned.name, type: cloned.type, file_path: cloned.file_path, tags: cloned.tags },
        };
      },
    },
  };
}
