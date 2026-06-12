import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { searchAssets } from '../../store/search.js';
import { formatSearch } from '../format.js';

/**
 * Register the `search` command — full-text search across all assets
 */
export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Full-text search across all assets')
    .option('-l, --limit <n>', 'Max results', '10')
    .option('-f, --format <format>', 'Output format: table|json|yaml|simple', 'table')
    .action(async (query: string, options: { limit: string; format: string }) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      const format = (options.format as 'table' | 'json' | 'yaml' | 'simple') || 'table';
      const results = await searchAssets(query, undefined, parseInt(options.limit, 10));
      console.log(formatSearch(results, format));
    });
}
