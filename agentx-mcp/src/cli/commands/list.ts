import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { listAssets } from '../../store/assets.js';
import { formatAssets } from '../format.js';
import type { AssetType } from '../../types.js';
import chalk from 'chalk';

const VALID_TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'];

export function registerListCommand(program: Command): void {
  program
    .command('list [type]')
    .description('List assets. Type: skill|prompt|rule|mcp|workflow|agent')
    .option('-f, --format <format>', 'Output format: table|json|yaml|simple', 'table')
    .action(async (type?: string, options?: { format?: string }) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

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
    });
}
