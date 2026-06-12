import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { getAsset, readAssetContent } from '../../store/assets.js';
import { formatMeta } from '../format.js';
import chalk from 'chalk';

/**
 * Register the `get` command — show asset details and optional content
 */
export function registerGetCommand(program: Command): void {
  program
    .command('get <id>')
    .description('Show asset details and content')
    .option('-c, --content', 'Print asset content')
    .action(async (id: string, opts: { content?: boolean }) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      const asset = await getAsset(id);
      if (!asset) {
        console.error(chalk.red(`Asset not found: ${id}`));
        process.exit(1);
      }

      console.log(formatMeta(asset));

      if (opts.content) {
        const content = await readAssetContent(id);
        console.log('\n' + chalk.cyan('Content:'));
        console.log(content);
      }
    });
}
