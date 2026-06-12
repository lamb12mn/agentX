import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { getAsset, readAssetContent, listAssets } from '../../store/assets.js';
import { exportAgent } from '../../export/claude.js';
import type { AgentConfig, AssetType } from '../../types.js';
import yaml from 'js-yaml';
import chalk from 'chalk';
import { exportAsZip, exportAsJson, exportAsYaml } from '../../utils/zip.js';

/**
 * Register the `export` and `export-all` commands — export assets to various formats
 */
export function registerExportCommand(program: Command): void {
  program
    .command('export <id>')
    .description('Export an agent to CLAUDE.md + settings.json')
    .option('-o, --output <dir>', 'Output directory', '.')
    .action(async (id: string, opts: { output: string }) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      const asset = await getAsset(id);
      if (!asset) {
        console.error(chalk.red(`Asset not found: ${id}`));
        process.exit(1);
      }
      if (asset.type !== 'agent') {
        console.error(chalk.red(`Asset is not an agent (type: ${asset.type})`));
        process.exit(1);
      }

      const content = await readAssetContent(id);
      let config: AgentConfig;
      try {
        config = yaml.load(content) as AgentConfig;
      } catch (err) {
        console.error(chalk.red(`Failed to parse agent YAML: ${String(err)}`));
        process.exit(1);
      }

      const result = await exportAgent(config, opts.output);
      console.log(chalk.green('Exported:'));
      console.log(`  ${chalk.cyan('CLAUDE.md:')}   ${result.claude_md_path}`);
      console.log(`  ${chalk.cyan('settings.json:')} ${result.settings_json_path}`);
    });

  // 新增：导出所有资产
  program
    .command('export-all')
    .description('Export all assets in various formats')
    .option('-f, --format <format>', 'Export format: claude|zip|json|yaml', 'claude')
    .option('-t, --type <type>', `Filter by type: ${['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'].join('|')}`)
    .option('-o, --output <path>', 'Output file or directory')
    .action(async (opts: { format: string; type?: string; output?: string }) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      const format = opts.format as 'claude' | 'zip' | 'json' | 'yaml';
      const type = opts.type as AssetType | undefined;

      // claude格式仅支持单个agent导出，这里导出所有agents
      if (format === 'claude') {
        const assets = await listAssets('agent');
        if (assets.length === 0) {
          console.log(chalk.yellow('No agents found to export.'));
          return;
        }

        const outputDir = opts.output ?? '.';
        for (const asset of assets) {
          const content = await readAssetContent(asset.id);
          let config: AgentConfig;
          try {
            config = yaml.load(content) as AgentConfig;
          } catch (err) {
            console.error(chalk.red(`Failed to parse agent ${asset.name}: ${String(err)}`));
            continue;
          }
          await exportAgent(config, outputDir);
          console.log(chalk.green(`✓ Exported agent: ${asset.name}`));
        }
        return;
      }

      // ZIP/JSON/YAML导出
      try {
        let outputPath: string;
        if (format === 'zip') {
          outputPath = await exportAsZip(baseDir, opts.output);
        } else if (format === 'json') {
          outputPath = await exportAsJson(baseDir, opts.output);
        } else if (format === 'yaml') {
          outputPath = await exportAsYaml(baseDir, opts.output);
        } else {
          console.error(chalk.red(`Unknown format: ${format}`));
          process.exit(1);
        }

        console.log(chalk.green(`✓ Exported to: ${outputPath}`));
      } catch (err) {
        console.error(chalk.red('Export failed:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
}

