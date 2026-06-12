import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

export function registerRestoreCommand(program: Command) {
    program
        .command('restore <backup-file>')
        .description('Restore AgentX data from a backup file')
        .option('--force', 'Overwrite existing files without confirmation', false)
        .action(async (backupFile, options) => {
            const backupPath = path.resolve(backupFile);
            if (!fs.existsSync(backupPath)) {
                console.error(chalk.red(`Backup file not found: ${backupPath}`));
                process.exit(1);
            }
            
            const cwd = process.cwd();
            const dataDirs = ['assets', 'skills', 'agents', 'workflows', 'prompts'];
            const existingDirs = dataDirs.filter(dir => fs.existsSync(path.join(cwd, dir)));
            
            if (existingDirs.length > 0 && !options.force) {
                console.log(chalk.yellow('Warning: Target directories already contain data.'));
                console.log(chalk.yellow('Existing directories:', existingDirs.join(', ')));
                const answer = await new Promise(resolve => {
                    process.stdout.write('Overwrite? (y/N): ');
                    process.stdin.once('data', data => resolve(data.toString().trim().toLowerCase() === 'y'));
                });
                if (!answer) {
                    console.log(chalk.gray('Restore cancelled.'));
                    process.exit(0);
                }
            }
            
            console.log(chalk.blue('Restoring backup...'));
            const tempDir = path.join(os.tmpdir(), 'agentx-restore');
            if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
            fs.mkdirSync(tempDir, { recursive: true });
            
            try {
                // 解压到临时目录
                execSync(`tar -xzf "${backupPath}" -C "${tempDir}"`, { stdio: 'inherit' });
                
                // 复制所有文件到当前目录（保持相对路径结构）
                const copyRecursive = (src, dest) => {
                    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
                    const entries = fs.readdirSync(src);
                    for (const entry of entries) {
                        const srcPath = path.join(src, entry);
                        const destPath = path.join(dest, entry);
                        if (fs.statSync(srcPath).isDirectory()) {
                            copyRecursive(srcPath, destPath);
                        } else {
                            fs.copyFileSync(srcPath, destPath);
                        }
                    }
                };
                // 临时目录中应该包含顶层目录如 assets/, skills/ 等
                const items = fs.readdirSync(tempDir);
                for (const item of items) {
                    const srcItem = path.join(tempDir, item);
                    const destItem = path.join(cwd, item);
                    if (fs.statSync(srcItem).isDirectory()) {
                        copyRecursive(srcItem, destItem);
                    } else {
                        fs.copyFileSync(srcItem, destItem);
                    }
                }
                
                console.log(chalk.green('Restore completed successfully.'));
            } catch (err) {
                console.error(chalk.red('Restore failed:'), err instanceof Error ? err.message : String(err));
                process.exit(1);
            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });
}