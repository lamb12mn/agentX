import { Command } from 'commander';
import chalk from 'chalk';
import { loadRemotes } from '../../../remote/config.js';

export function registerRemoteList(program: Command) {
    const remote = program.command('remote').description('Remote management commands');
    remote
        .command('list')
        .description('List all configured remotes')
        .action(() => {
            const remotes = loadRemotes();
            if (remotes.length === 0) {
                console.log(chalk.yellow('No remotes configured.'));
                return;
            }
            console.log(chalk.bold('Configured remotes:'));
            remotes.forEach((r: { name: string; url: string }) => {
                console.log(chalk.cyan(`  ${r.name} -> ${r.url}`));
            });
        });
}