import { Command } from 'commander';
import chalk from 'chalk';
import { queryAudit, AuditAction } from '../../audit/index.js';

export function registerAuditCommand(program: Command) {
    program
        .command('audit')
        .description('Query audit logs')
        .option('-a, --action <action>', 'Filter by action (CREATE_ASSET, UPDATE_ASSET, DELETE_ASSET, etc.)')
        .option('-i, --asset-id <id>', 'Filter by asset ID')
        .option('--from <date>', 'Start date (ISO format)', '1970-01-01')
        .option('--to <date>', 'End date (ISO format)', new Date().toISOString())
        .option('-l, --limit <number>', 'Maximum number of entries', '50')
        .option('--json', 'Output as JSON lines')
        .action(async (options) => {
            const fromDate = new Date(options.from);
            const toDate = new Date(options.to);
            const limit = parseInt(options.limit);
            
            const entries = queryAudit({
                action: options.action as AuditAction,
                assetId: options.assetId,
                from: fromDate,
                to: toDate,
                limit
            });
            
            if (options.json) {
                entries.forEach(e => console.log(JSON.stringify(e)));
            } else {
                if (entries.length === 0) {
                    console.log(chalk.yellow('No audit entries found.'));
                    return;
                }
                console.log(chalk.bold('Audit Log:\n'));
                for (const e of entries) {
                    console.log(chalk.cyan(`[${e.timestamp}] ${e.action}`));
                    console.log(chalk.gray(`  User: ${e.userId}`));
                    if (e.assetId) console.log(chalk.gray(`  Asset: ${e.assetId}`));
                    if (e.details) console.log(chalk.gray(`  Details: ${JSON.stringify(e.details)}`));
                    console.log('');
                }
                console.log(chalk.gray(`Total: ${entries.length} entries`));
            }
        });
}