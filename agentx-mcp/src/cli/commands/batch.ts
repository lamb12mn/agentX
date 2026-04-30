import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { getAsset, deleteAsset, listAssets } from '../../store/assets.js';
import { confirm, input, multiSelect } from '@inquirer/prompts';
import chalk from 'chalk';
import type { AssetType } from '../../types.js';
import { batchDeleteAssets, batchUpdateTags } from '../../store/assets.js';
import { batchCheckDependencies } from '../../store/dependencies.js';
import { formatError } from '../../utils/errors.js';

const VALID_TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'];

export function registerBatchCommand(program: Command): void {
  program
    .command('batch')
    .description('Batch operations on multiple assets')
    .addSubcommand(
      new (class {
        constructor() {
          this
            .name('delete')
            .description('Delete multiple assets by ID')
            .argument('<ids...>', 'Asset IDs to delete')
            .option('-y, --yes', 'Skip confirmation prompt')
            .option('--check-deps', 'Check dependencies before deletion', true)
            .action(this.handleDelete.bind(this));
        }

        async handleDelete(ids: string[], options: { yes?: boolean; checkDeps?: boolean }) {
          const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
          initDb(join(baseDir, 'agentx.db'));

          // 验证所有资产存在
          const assetsToDelete: Array<{ id: string; name: string; type: AssetType }> = [];
          const notFound: string[] = [];

          for (const id of ids) {
            const asset = await getAsset(id);
            if (!asset) {
              notFound.push(id);
              continue;
            }
            assetsToDelete.push({ id: asset.id, name: asset.name, type: asset.type });
          }

          if (notFound.length > 0) {
            console.error(chalk.red(`Assets not found: ${notFound.join(', ')}`));
          }

          if (assetsToDelete.length === 0) {
            console.log(chalk.yellow('No valid assets to delete.'));
            return;
          }

          // 依赖检查
          if (options.checkDeps) {
            const checks = batchCheckDependencies(assetsToDelete.map(a => a.id));
            const unsafe = Array.from(checks.entries()).filter(([_, check]) => !check.safe);

            if (unsafe.length > 0) {
              console.log(chalk.yellow('\n⚠️  Dependency Check:'));
              for (const [id, check] of unsafe) {
                const asset = assetsToDelete.find(a => a.id === id);
                console.log(chalk.yellow(`  ${asset?.name ?? id} (${asset?.type ?? 'unknown'})`));
                if (check.dependents.length > 0) {
                  console.log(chalk.red(`    ↓ Depended by ${check.dependents.length} asset(s)`));
                }
                if (check.dependencies.length > 0) {
                  console.log(chalk.yellow(`    ↑ Depends on ${check.dependencies.length} asset(s)`));
                }
              }
              console.log('');

              if (!options.yes) {
                const force = await confirm({
                  message: `Some assets have dependencies. Force delete anyway?`,
                  default: false,
                });
                if (!force) {
                  console.log(chalk.dim('Cancelled.'));
                  return;
                }
              }
            } else {
              console.log(chalk.green('✓ No dependency issues detected.'));
            }
          }

          // 确认
          if (!options.yes) {
            const assetList = assetsToDelete.map(a => `  - ${a.name} (${a.type})`).join('\n');
            const ok = await confirm({
              message: `Delete ${assetsToDelete.length} asset(s)?\n${assetList}\n\nThis cannot be undone.`,
              default: false,
            });
            if (!ok) {
              console.log(chalk.dim('Cancelled.'));
              return;
            }
          }

          // 批量删除（使用事务）
          try {
            const result = await batchDeleteAssets(assetsToDelete.map(a => a.id));
            console.log(chalk.green(`✓ Deleted ${result.success} asset(s)`));
            if (result.failed > 0) {
              console.log(chalk.yellow(`⚠️  ${result.failed} asset(s) failed to delete`));
            }
          } catch (e) {
            console.error(chalk.red('Batch delete failed:'), formatError(e as Error));
            process.exit(1);
          }
        }
      })
    )
    .addSubcommand(
      new (class {
        constructor() {
          this
            .name('tag')
            .description('Add or remove tags from multiple assets')
            .argument('<ids...>', 'Asset IDs to modify')
            .argument('<action>', 'Action: add|remove')
            .argument('<tags...>', 'Tags to add/remove')
            .option('-y, --yes', 'Skip confirmation prompt')
            .action(this.handleTag.bind(this));
        }

        async handleTag(ids: string[], action: 'add' | 'remove', tags: string[], options: { yes?: boolean }) {
          if (action !== 'add' && action !== 'remove') {
            console.error(chalk.red('Invalid action. Use "add" or "remove"'));
            process.exit(1);
          }

          const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
          initDb(join(baseDir, 'agentx.db'));

          // 验证资产存在
          const validIds: string[] = [];
          const notFound: string[] = [];

          for (const id of ids) {
            const asset = await getAsset(id);
            if (!asset) {
              notFound.push(id);
            } else {
              validIds.push(id);
            }
          }

          if (notFound.length > 0) {
            console.error(chalk.red(`Assets not found: ${notFound.join(', ')}`));
          }

          if (validIds.length === 0) {
            console.log(chalk.yellow('No valid assets to modify.'));
            return;
          }

          // 确认
          if (!options.yes) {
            const tagList = tags.join(', ');
            const actionVerb = action === 'add' ? 'Add' : 'Remove';
            const ok = await confirm({
              message: `${actionVerb} tags [${tagList}] to ${validIds.length} asset(s)?`,
              default: false,
            });
            if (!ok) {
              console.log(chalk.dim('Cancelled.'));
              return;
            }
          }

          // 批量更新标签
          try {
            const result = await batchUpdateTags(validIds, action, tags);
            console.log(chalk.green(`✓ ${action === 'add' ? 'Added' : 'Removed'} tags for ${result.success} asset(s)`));
            if (result.failed > 0) {
              console.log(chalk.yellow(`⚠️  ${result.failed} asset(s) failed`));
            }
          } catch (e) {
            console.error(chalk.red('Batch tag operation failed:'), formatError(e as Error));
            process.exit(1);
          }
        }
      })
    );
}
