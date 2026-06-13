import type { Command } from 'commander';
import { registerImportTools } from '../../tools/import.js';
import type { AssetType } from '../../types.js';
import chalk from 'chalk';
import { getBaseDir, withDb } from '../common.js';

const VALID_TYPES: AssetType[] = ['skill', 'prompt', 'rule'];

/**
 * Register the `import` command — import assets from Claude Code directories
 */
export function registerImportCommand(program: Command): void {
  program
    .command('import <type>')
    .description('Import assets from Claude Code directories. Type: skill|prompt|rule')
    .option('-s, --source <dir>', 'Override source directory')
    .option('-t, --tags <tags>', 'Comma-separated tags to apply', 'imported,claude')
    .action(withDb(async (type: string, opts: { source?: string; tags: string }) => {
      if (!VALID_TYPES.includes(type as AssetType)) {
        console.error(chalk.red(`Unknown type: ${type}. Valid: ${VALID_TYPES.join(', ')}`));
        process.exit(1);
      }

      const baseDir = getBaseDir();
      const tags = opts.tags.split(',').map((t) => t.trim()).filter(Boolean);
      const tools = registerImportTools(baseDir);
      const result = await tools.import_from_claude.handler({
        type: type as AssetType,
        source_dir: opts.source,
        tags,
      });

      if (result.imported.length > 0) {
        console.log(chalk.green(`Imported ${result.imported.length} asset(s):`));
        for (const a of result.imported) {
          console.log(`  + ${a.name}`);
        }
      }
      if (result.skipped.length > 0) {
        console.log(chalk.dim(`Skipped ${result.skipped.length} (already exist): ${result.skipped.join(', ')}`));
      }
      if (result.errors.length > 0) {
        console.log(chalk.red(`Errors (${result.errors.length}):`));
        for (const e of result.errors) {
          console.log(`  ${chalk.red('✗')} ${e}`);
        }
      }
      if (result.imported.length === 0 && result.errors.length === 0) {
        console.log(chalk.yellow('Nothing to import.'));
      }
    }));
}
