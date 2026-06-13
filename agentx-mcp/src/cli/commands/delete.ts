import type { Command } from 'commander';
import { getAsset, deleteAsset, listAssets } from '../../store/assets.js';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type { AssetType } from '../../types.js';
import { checkDeleteSafety } from '../../store/dependencies.js';
import { getBaseDir, withDb } from '../common.js';

const VALID_TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'];

/**
 * Register the `delete` command — delete asset(s) by ID or by type
 */
export function registerDeleteCommand(program: Command): void {
  program
    .command('delete [id...]')
    .description('Delete asset(s) by ID. Supports: delete <id> [id...], delete --type <type>')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('-t, --type <type>', `Delete all assets of type: ${VALID_TYPES.join('|')}`)
    .action(withDb(async (ids: string[] | undefined, options?: { yes?: boolean; type?: string }) => {
      const baseDir = getBaseDir();

      const idsToDelete: string[] = [];
      const assetsToDelete: Array<{ id: string; name: string; type: AssetType }> = [];

      // Determine what to delete
      if (options?.type) {
        const type = options.type as AssetType;
        if (!VALID_TYPES.includes(type)) {
          console.error(chalk.red(`Invalid type: ${type}`));
          process.exit(1);
        }
        const assets = await listAssets(type);
        for (const a of assets) {
          idsToDelete.push(a.id);
          assetsToDelete.push({ id: a.id, name: a.name, type: a.type });
        }
      } else if (ids && ids.length > 0) {
        for (const id of ids) {
          const asset = await getAsset(id);
          if (!asset) {
            console.error(chalk.red(`Asset not found: ${id}`));
            continue;
          }
          idsToDelete.push(id);
          assetsToDelete.push({ id: asset.id, name: asset.name, type: asset.type });
        }
      } else {
        console.error(chalk.red('Error: Provide asset ID(s) or use --type'));
        process.exit(1);
      }

      if (idsToDelete.length === 0) {
        console.log(chalk.yellow('No assets to delete.'));
        return;
      }

      // 依赖检查
      console.log(chalk.blue('\n🔍 Checking dependencies...'));
      let hasDependencyIssues = false;
      for (const id of idsToDelete) {
        const check = checkDeleteSafety(id);
        if (!check.safe) {
          hasDependencyIssues = true;
          const asset = assetsToDelete.find(a => a.id === id);
          console.log(chalk.yellow(`  ⚠️  ${asset?.name ?? id}`));
          if (check.dependents.length > 0) {
            console.log(chalk.red(`     Depended by ${check.dependents.length} asset(s)`));
          }
          if (check.dependencies.length > 0) {
            console.log(chalk.yellow(`     Depends on ${check.dependencies.length} asset(s)`));
          }
        }
      }
      console.log('');

      if (hasDependencyIssues && !options?.yes) {
        const force = await confirm({
          message: chalk.yellow('Some assets have dependencies. Force delete anyway?'),
          default: false,
        });
        if (!force) {
          console.log(chalk.dim('Cancelled.'));
          return;
        }
      }

      // Confirm
      if (!options?.yes) {
        const assetList = assetsToDelete.map(a => `  - ${a.name} (${a.type})`).join('\n');
        const ok = await confirm({
          message: `Delete ${idsToDelete.length} asset(s)?\n${assetList}\n\nThis cannot be undone.`,
          default: false,
        });
        if (!ok) {
          console.log(chalk.dim('Cancelled.'));
          return;
        }
      }

      // Delete
      let deleted = 0;
      for (const id of idsToDelete) {
        try {
          await deleteAsset(id);
          deleted++;
        } catch (e) {
          console.error(chalk.red(`Failed to delete ${id}:`), e instanceof Error ? e.message : e);
        }
      }

      console.log(chalk.green(`✓ Deleted ${deleted} asset(s)`));
    }));
}
