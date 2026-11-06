import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { getBaseDir } from '../common.js';
import type { AssetType } from '../../types.js';

/** Directory each asset type is stored in (matches store/assets.ts). */
const ASSET_TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent', 'team'];
const DATA_DIRS = ASSET_TYPES.map(t => `${t}s`);
const DB_FILE = 'agentx.db';

/**
 * Register the `backup` command — backup all AgentX data to a tar.gz archive
 */
export function registerBackupCommand(program: Command) {
    program
        .command('backup')
        .description('Backup all AgentX data (database, assets, skills, agents, workflows, prompts, rules, mcps, teams)')
        .option('-o, --output <file>', 'Output file path', `agentx-backup-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`)
        .option('--exclude-dir <dirs>', 'Comma-separated directories to exclude (e.g., plugins,tmp)')
        .action(async (options) => {
            // Back up the real data directory, not the current working directory
            const baseDir = getBaseDir();
            if (!fs.existsSync(baseDir)) {
                console.error(chalk.red(`Data directory not found: ${baseDir}`));
                process.exit(1);
            }

            const excludeDirs = new Set(
                (options.excludeDir ? String(options.excludeDir).split(',') : [])
                    .map((d: string) => d.trim())
                    .filter(Boolean),
            );

            // Archive members are relative names, so extraction restores the same layout
            const members = [
                ...DATA_DIRS.filter(dir =>
                    fs.existsSync(path.join(baseDir, dir)) && !excludeDirs.has(dir)),
                ...(fs.existsSync(path.join(baseDir, DB_FILE)) ? [DB_FILE] : []),
            ];

            if (members.length === 0) {
                console.error(chalk.red(`No data found to backup in ${baseDir}.`));
                process.exit(1);
            }

            const outputPath = path.resolve(options.output);
            console.log(chalk.blue(`Creating backup of ${baseDir}...`));

            const args = ['-czf', outputPath];
            // --exclude options must precede the member list to be applied by tar
            for (const exclude of excludeDirs) {
                args.push(`--exclude=${exclude}`);
            }
            args.push('-C', baseDir, ...members);

            try {
                // Argument array (no shell) — paths and exclude patterns cannot inject commands
                execFileSync('tar', args, { stdio: 'inherit' });
                console.log(chalk.green(`Backup saved to ${outputPath}`));
            } catch (err) {
                console.error(chalk.red('Backup failed:'), err instanceof Error ? err.message : String(err));
                process.exit(1);
            }
        });
}

export { DATA_DIRS, DB_FILE };
