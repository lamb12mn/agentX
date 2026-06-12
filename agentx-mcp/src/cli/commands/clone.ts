import { Command } from 'commander';
import chalk from 'chalk';
import { cloneAsset, getAsset } from '../store/assets.js';

export function registerCloneCommand(program: Command): void {
  program
    .command('clone')
    .description('克隆资产（创建副本）')
    .argument('<id>', '要克隆的资产ID')
    .option('-n, --name <name>', '新资产名称（可选）')
    .action(async (id: string, options: { name?: string }) => {
      try {
        const baseDir = process.env.AGENTX_DIR ?? process.cwd();

        // 验证源资产存在
        const sourceAsset = await getAsset(id);
        if (!sourceAsset) {
          console.log(chalk.red(`❌ Asset not found: ${id}`));
          process.exit(1);
        }

        console.log(chalk.blue(`\n🔄 Cloning asset: ${sourceAsset.name} (${sourceAsset.type})`));

        // 执行克隆
        const cloned = await cloneAsset(id, options.name, baseDir);

        console.log(chalk.green(`✅ Cloned successfully!`));
        console.log(chalk.gray(`   New ID: ${cloned.id}`));
        console.log(chalk.gray(`   Name: ${cloned.name}`));
        console.log(chalk.gray(`   Type: ${cloned.type}`));
        console.log(chalk.gray(`   File: ${cloned.file_path}`));
      } catch (error) {
        console.log(chalk.red(`❌ Failed to clone asset: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}