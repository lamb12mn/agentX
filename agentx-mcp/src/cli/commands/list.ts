import type { Command } from 'commander';
import { listAssets } from '../../store/assets.js';
import { formatAssets } from '../format.js';
import type { AssetType } from '../../types.js';
import chalk from 'chalk';
import { getDbPath, withDb } from '../common.js';

const VALID_TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'];

/**
 * Register the `list` command — list assets by type with formatted output
 */
export function registerListCommand(program: Command): void {
  program
    .command('list [type]')
    .description('List assets. Type: skill|prompt|rule|mcp|workflow|agent')
    .option('-f, --format <format>', 'Output format: table|json|yaml|simple', 'table')
    .action(withDb(async (type?: string, options?: { format?: string }) => {
      if (type && !VALID_TYPES.includes(type as AssetType)) {
        console.error(chalk.red(`Unknown type: ${type}. Valid: ${VALID_TYPES.join(', ')}`));
        process.exit(1);
      }

      const format = (options?.format as 'table' | 'json' | 'yaml' | 'simple') || 'table';
      const assets = await listAssets(type as AssetType | undefined);
      console.log(formatAssets(assets, format));
      const label = type ? `${type}s` : 'assets';
      if (format === 'table') {
        console.log(chalk.dim(`${assets.length} ${label} found.`));
      }
    }));
}
