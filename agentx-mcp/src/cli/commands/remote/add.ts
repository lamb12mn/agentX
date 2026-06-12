import { Command } from 'commander';
import chalk from 'chalk';
import { addRemote } from '../../../remote/config.js';

export function registerRemoteAdd(program: Command) {
    const remote = program.command('remote').description('Remote management commands');
    remote
        .command('add <name> <url>')
        .description('Add a remote AgentX endpoint')
        .option('--api-key <key>', 'API key for authentication')
        .action(async (name: string, url: string, options: { apiKey?: string }) => {
            try {
                addRemote({ name, url, apiKey: options.apiKey });
                console.log(chalk.green(`Remote '${name}' added successfully.`));
            } catch (err) {
                console.error(chalk.red((err as Error).message));
                process.exit(1);
            }
        });
}