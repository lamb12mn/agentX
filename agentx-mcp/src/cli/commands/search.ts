import type { Command } from 'commander';
import { searchAssets } from '../../store/search.js';
import { formatSearch } from '../format.js';
import { withDb } from '../common.js';

/**
 * Register the `search` command — full-text search across all assets
 */
export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Full-text search across all assets')
    .option('-l, --limit <n>', 'Max results', '10')
    .option('-f, --format <format>', 'Output format: table|json|yaml|simple', 'table')
    .action(withDb(async (query: string, options: { limit: string; format: string }) => {

      const format = (options.format as 'table' | 'json' | 'yaml' | 'simple') || 'table';
      const results = await searchAssets(query, undefined, parseInt(options.limit, 10));
      console.log(formatSearch(results, format));
    }));
}
