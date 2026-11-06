import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import os from 'os';
import { getBaseDir } from '../common.js';
import { DATA_DIRS, DB_FILE } from './backup.js';

/** Top-level entries an AgentX backup is allowed to contain. */
const ALLOWED_ENTRIES = new Set<string>([...DATA_DIRS, DB_FILE]);

/**
 * Register the `restore` command — restore AgentX data from a backup file
 */
export function registerRestoreCommand(program: Command) {
    program
        .command('restore <backup-file>')
        .description('Restore AgentX data from a backup file into the data directory')
        .option('--force', 'Overwrite existing files without confirmation', false)
        .action(async (backupFile, options) => {
            const backupPath = path.resolve(backupFile);
            if (!fs.existsSync(backupPath)) {
                console.error(chalk.red(`Backup file not found: ${backupPath}`));
                process.exit(1);
            }

            const baseDir = getBaseDir();
            const existing = DATA_DIRS.filter(dir => fs.existsSync(path.join(baseDir, dir)))
                .concat(fs.existsSync(path.join(baseDir, DB_FILE)) ? [DB_FILE] : []);

            if (existing.length > 0 && !options.force) {
                console.log(chalk.yellow('Warning: Target directories already contain data.'));
                console.log(chalk.yellow('Existing entries:', existing.join(', ')));

                // Non-interactive runs (CI, pipes) cannot answer a prompt — require --force there
                if (!process.stdin.isTTY) {
                    console.error(chalk.red('Refusing to overwrite existing data without a TTY. Re-run with --force.'));
                    process.exit(1);
                }

                const answer = await new Promise<boolean>(resolve => {
                    process.stdout.write('Overwrite? (y/N): ');
                    process.stdin.once('data', data => resolve(data.toString().trim().toLowerCase() === 'y'));
                });
                if (!answer) {
                    console.log(chalk.gray('Restore cancelled.'));
                    process.exit(0);
                }
            }

            console.log(chalk.blue(`Restoring backup into ${baseDir}...`));
            const tempDir = path.join(os.tmpdir(), `agentx-restore-${process.pid}`);
            fs.rmSync(tempDir, { recursive: true, force: true });
            fs.mkdirSync(tempDir, { recursive: true });

            try {
                // Argument array (no shell) so the file path cannot inject commands
                execFileSync('tar', ['-xzf', backupPath, '-C', tempDir], { stdio: 'inherit' });

                fs.mkdirSync(baseDir, { recursive: true });

                const copyRecursive = (src: string, dest: string) => {
                    if (fs.statSync(src).isDirectory()) {
                        fs.mkdirSync(dest, { recursive: true });
                        for (const entry of fs.readdirSync(src)) {
                            copyRecursive(path.join(src, entry), path.join(dest, entry));
                        }
                    } else {
                        fs.copyFileSync(src, dest);
                    }
                };

                // Only whitelisted top-level entries are restored — a crafted archive
                // cannot drop files outside the known data layout
                const restored: string[] = [];
                for (const item of fs.readdirSync(tempDir)) {
                    if (!ALLOWED_ENTRIES.has(item)) {
                        console.log(chalk.gray(`  skipped unexpected entry: ${item}`));
                        continue;
                    }
                    copyRecursive(path.join(tempDir, item), path.join(baseDir, item));
                    restored.push(item);
                }

                if (restored.length === 0) {
                    console.error(chalk.red('Archive contains no known AgentX data entries.'));
                    process.exit(1);
                }

                console.log(chalk.green(`Restore completed successfully (${restored.join(', ')}).`));
            } catch (err) {
                console.error(chalk.red('Restore failed:'), err instanceof Error ? err.message : String(err));
                process.exit(1);
            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });
}
