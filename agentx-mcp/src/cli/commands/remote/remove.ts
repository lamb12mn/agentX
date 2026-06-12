import { Command } from 'commander';
import chalk from 'chalk';
import { removeRemote } from '../../../remote/config.js';

/**
 * Register the `remote remove` command — remove a remote endpoint
 */
export function registerRemoteRemove(program: Command) {
    const remote = program.command('remote').description('Remote management commands');
    remote
        .command('remove <name>')
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