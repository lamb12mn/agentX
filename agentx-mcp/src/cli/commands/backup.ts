import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

export function registerBackupCommand(program: Command) {
    program
        .command('backup')
        .description('Backup all AgentX data (assets, skills, agents, workflows, prompts)')
        .option('-o, --output <file>', 'Output file path', `agentx-backup-${new Date().toISOString().replace(/:/g, '-')}.tar.gz`)
        .option('--exclude-dir <dirs>', 'Comma-separated directories to exclude (e.g., node_modules,.git)', '')
        .action(async (options) => {
            const cwd = process.cwd();
            const dataDirs = ['assets', 'skills', 'agents', 'workflows', 'prompts'];
            const excludeDirs = options.excludeDir ? options.excludeDir.split(',') : [];
            const tempListPath = path.join(os.tmpdir(), 'agentx-backup-files.txt');
            
            // 查找存在的目录
            const existingDirs = dataDirs.filter(dir => fs.existsSync(path.join(cwd, dir)));
            if (existingDirs.length === 0) {
                console.error(chalk.red('No data directories found to backup.'));
                process.exit(1);
            }
            
            console.log(chalk.blue('Creating backup...'));
            
            // 生成文件列表
            let fileList = '';
            for (const dir of existingDirs) {
                const fullDir = path.join(cwd, dir);
                const files = fs.readdirSync(fullDir);
                for (const file of files) {
                    const fullPath = path.join(fullDir, file);
                    if (fs.statSync(fullPath).isFile()) {
                        fileList += fullPath + '\n';
                    }
                }
            }
            fs.writeFileSync(tempListPath, fileList, 'utf8');
            
            // 构建 tar 命令
            const outputPath = path.resolve(options.output);
            let tarCmd = `tar -czf "${outputPath}" -T "${tempListPath}"`;
            // 添加排除项
            for (const exclude of excludeDirs) {
                tarCmd += ` --exclude="${exclude}"`;
            }
            
            try {
                execSync(tarCmd, { stdio: 'inherit' });
                console.log(chalk.green(`Backup saved to ${outputPath}`));
            } catch (err) {
                console.error(chalk.red('Backup failed:'), err.message);
                process.exit(1);
            } finally {
                fs.unlinkSync(tempListPath);
            }
        });
}