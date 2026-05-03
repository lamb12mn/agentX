import { getAsset, readAssetContent, listAssets } from '../store/assets.js';
import { exportAgent } from '../export/claude.js';
import { exportAsZip, exportAsJson, exportAsYaml } from '../utils/zip.js';
import type { AgentConfig, AssetType } from '../types.js';
import yaml from 'js-yaml';
import { createError, ErrorCode } from '../utils/errors.js';

/**
 * 导出工具MCP工具
 */

export function registerExportTools(baseDir: string) {
  return {
    export_agent: {
      description: 'Export an agent to CLAUDE.md + settings.json format for Claude Code',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Agent asset ID to export',
          },
          output_dir: {
            type: 'string',
            description: 'Output directory path (default: current directory)',
            default: '.',
          },
        },
        required: ['id'],
        description: 'Export a single agent to CLAUDE.md and settings.json files.',
      },
      handler: async ({ id, output_dir = '.' }) => {
        const asset = await getAsset(id);
        if (!asset) {
          throw createError('ASSET_NOT_FOUND', { assetId: id });
        }
        if (asset.type !== 'agent') {
          throw createError('INVALID_INPUT', {
            details: `Asset is not an agent (type: ${asset.type})`,
          });
        }

        const content = await readAssetContent(id);
        let config: AgentConfig;
        try {
          config = yaml.load(content) as AgentConfig;
        } catch (err) {
          throw createError('INVALID_CONTENT', {
            details: `Failed to parse agent YAML: ${String(err)}`,
          });
        }

        const result = await exportAgent(config, output_dir);
        return {
          success: true,
          claude_md: result.claude_md_path,
          settings_json: result.settings_json_path,
        };
      },
    },

    export_all: {
      description: 'Export all assets (or filtered by type) in various formats: claude, zip, json, yaml',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['claude', 'zip', 'json', 'yaml'],
            description: 'Export format (default: claude)',
            default: 'claude',
          },
          type: {
            type: 'string',
            enum: ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'],
            description: 'Filter by asset type',
          },
          output: {
            type: 'string',
            description: 'Output file path (for zip/json/yaml) or directory (for claude)',
          },
        },
        description: 'Export all assets. Format "claude" exports agents only to CLAUDE.md format. Other formats export all assets.',
      },
      handler: async ({ format = 'claude', type, output }) => {
        const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');

        if (format === 'claude') {
          // 仅导出agents
          const assets = await listAssets('agent');
          if (assets.length === 0) {
            return { success: true, message: 'No agents to export', exported: 0 };
          }

          const outputDir = output ?? '.';
          const results: string[] = [];

          for (const asset of assets) {
            const content = await readAssetContent(asset.id);
            let config: AgentConfig;
            try {
              config = yaml.load(content) as AgentConfig;
            } catch (err) {
              throw createError('INVALID_CONTENT', {
                details: `Failed to parse agent ${asset.name}: ${String(err)}`,
              });
            }
            const result = await exportAgent(config, outputDir);
            results.push(asset.name);
          }

          return {
            success: true,
            message: `Exported ${assets.length} agents`,
            exported: assets.length,
            agents: results,
          };
        }

        // ZIP/JSON/YAML导出
        try {
          let resultPath: string;

          if (format === 'zip') {
            resultPath = await exportAsZip(baseDir, output);
          } else if (format === 'json') {
            resultPath = await exportAsJson(baseDir, output);
          } else if (format === 'yaml') {
            resultPath = await exportAsYaml(baseDir, output);
          } else {
            throw createError('INVALID_INPUT', { details: `Unknown format: ${format}` });
          }

          return {
            success: true,
            message: `Exported to ${resultPath}`,
            path: resultPath,
            format,
          };
        } catch (err) {
          throw createError('EXPORT_FAILED', {
            details: err instanceof Error ? err.message : String(err),
          });
        }
      },
    },
  };
}

import { join } from 'path';
import { homedir } from 'os';
