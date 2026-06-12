import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Register the `doctor` command — diagnose environment, dependencies, and configuration
 */
export function registerDoctorCommand(program: Command) {
    program
        .command('doctor')
        .description('诊断 AgentX 环境、依赖、配置和权限问题')
        .action(async () => {
            console.log(chalk.bold.blue('🔍 AgentX Doctor - 诊断中...\n'));
            
            let hasError = false;
            
            // 1. 检查 Node.js 版本
            const nodeVersion = process.version.slice(1);
            const [major] = nodeVersion.split('.');
            if (parseInt(major) >= 18) {
                console.log(chalk.green('✅ Node.js 版本:'), nodeVersion);
            } else {
                console.log(chalk.red('❌ Node.js 版本过低 (需要 >=18):'), nodeVersion);
                hasError = true;
            }
            
            // 2. 检查包管理器
            let pkgManager = 'npm';
            try {
                execSync('pnpm --version', { stdio: 'ignore' });
                pkgManager = 'pnpm';
            } catch(e) {}
            try {
                execSync('yarn --version', { stdio: 'ignore' });
                pkgManager = 'yarn';
            } catch(e) {}
            console.log(chalk.green('✅ 包管理器:'), pkgManager);
            
            // 3. 检查项目依赖
            const pkgPath = path.join(process.cwd(), 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                const missingDeps: string[] = [];
                for (const dep of Object.keys(deps)) {
                    try {
                        require.resolve(dep, { paths: [process.cwd()] });
                    } catch(e) {
                        missingDeps.push(dep);
                    }
                }
                if (missingDeps.length === 0) {
                    console.log(chalk.green('✅ 所有依赖已安装'));
                } else {
                    console.log(chalk.red('❌ 缺少依赖:'), missingDeps.join(', '));
                    console.log(chalk.yellow('💡 运行:'), `${pkgManager} install`);
                    hasError = true;
                }
            } else {
                console.log(chalk.yellow('⚠️ 未找到 package.json，跳过依赖检查'));
            }
            
            // 4. 检查配置文件 (config.yaml 或 .env)
            const configPath = path.join(process.cwd(), 'config.yaml');
            if (fs.existsSync(configPath)) {
                console.log(chalk.green('✅ 配置文件存在: config.yaml'));
            } else {
                console.log(chalk.yellow('⚠️ 未找到 config.yaml，将使用默认配置'));
            }
            
            // 5. 检查存储目录权限 (assets, skills, agents 等)
            const dirs = ['assets', 'skills', 'agents', 'workflows', 'prompts'];
            for (const dir of dirs) {
                const fullPath = path.join(process.cwd(), dir);
                try {
                    fs.accessSync(fullPath, fs.constants.W_OK);
                    console.log(chalk.green(`✅ 目录可写: ${dir}`));
                } catch(e) {
                    console.log(chalk.red(`❌ 目录不可写: ${dir}`));
                    hasError = true;
                }
            }
            
            // 6. 检查 Git 状态 (可选)
            try {
                const gitStatus = execSync('git status --porcelain', { stdio: 'pipe' }).toString();
                if (gitStatus.length === 0) {
                    console.log(chalk.green('✅ Git 工作区干净'));
                } else {
                    console.log(chalk.yellow('⚠️ Git 工作区有未提交的更改'));
                }
            } catch(e) {
                console.log(chalk.yellow('⚠️ 未检测到 Git 仓库'));
            }
            
            // 7. 检查磁盘空间
            const freeSpace = os.freemem() / (1024**3);
            if (freeSpace > 1) {
                console.log(chalk.green(`✅ 可用内存: ${freeSpace.toFixed(2)} GB`));
            } else {
                console.log(chalk.red(`❌ 可用内存过低: ${freeSpace.toFixed(2)} GB`));
                hasError = true;
            }
            
            console.log('\n' + chalk.bold('📋 诊断完成。'));
            if (hasError) {
                console.log(chalk.red('发现一些问题，请根据上述提示修复。'));
                process.exit(1);
            } else {
                console.log(chalk.green('一切正常！AgentX 可以运行。'));
            }
        });
}