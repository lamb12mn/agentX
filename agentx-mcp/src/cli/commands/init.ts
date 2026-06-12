import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Register the `init` command — initialize a new project from a template
 */
export function registerInitCommand(program: Command) {
    program
        .command('init [template]')
        .description('Initialize a new project from a template (git clone)')
        .option('-d, --dir <directory>', 'Target directory', '.')
        .option('--depth <number>', 'Clone depth', '1')
        .action(async (template = 'basic-mcp-server', options) => {
            const targetDir = path.resolve(process.cwd(), options.dir);
            const depth = options.depth;

            // Template repository mapping
            const repos: Record<string, string> = {
                'basic-mcp-server': 'https://github.com/agentx-templates/basic-mcp-server',
                'empty': 'https://github.com/agentx-templates/empty',
            };
            const repoUrl = repos[template];
            if (!repoUrl) {
                console.error(chalk.red(`Unknown template: ${template}`));
                console.log(chalk.yellow('Available templates: basic-mcp-server, empty'));
                process.exit(1);
            }

            // Check if target directory exists and is not empty
            if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
                console.error(chalk.red(`Target directory '${targetDir}' is not empty.`));
                process.exit(1);
            }

            console.log(chalk.blue(`Cloning template '${template}' into ${targetDir}...`));
            try {
                execSync(`git clone --depth ${depth} ${repoUrl} ${targetDir}`, { stdio: 'inherit' });
                // Remove .git folder to detach from template repo
                const gitDir = path.join(targetDir, '.git');
                if (fs.existsSync(gitDir)) {
                    fs.rmSync(gitDir, { recursive: true, force: true });
                }
                console.log(chalk.green(`Project initialized successfully in ${targetDir}`));
                console.log(chalk.cyan('Next steps:'));
                console.log(chalk.white(`  cd ${options.dir !== '.' ? options.dir : '.'}`));
                console.log(chalk.white('  npm install'));
                console.log(chalk.white('  npm run dev'));
            } catch (err: any) {
                console.error(chalk.red('Failed to clone repository:'), err.message);
                process.exit(1);
            }
        });
}