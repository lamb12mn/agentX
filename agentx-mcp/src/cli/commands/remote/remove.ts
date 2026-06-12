import { Command } from 'commander';
import chalk from 'chalk';
import { removeRemote } from '../../remote/config.js';

export function registerRemoteRemove(program: Command) {
    program
        .command('remote remove <name>')
        .description('Remove a remote endpoint')
        .action(async (name: string) => {
            try {
                removeRemote(name);
                console.log(chalk.green(`Remote '${name}' removed.`));
            } catch (err) {
                console.error(chalk.red((err as Error).message));
                process.exit(1);
            }
        });
}