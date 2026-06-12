import { Command } from 'commander';
import chalk from 'chalk';
import { getRemote } from '../../../remote/config.js';
import { pushAsset } from '../../../remote/client.js';
import { getAsset, listAssets } from '../../../store/assets.js';

export function registerPush(program: Command) {
    program
        .command('push <remote> [assetId]')
        .description('Push assets to remote (if assetId omitted, push all)')
        .action(async (remoteName: string, assetId?: string) => {
            const remote = getRemote(remoteName);
            if (!remote) {
                console.error(chalk.red(`Remote '${remoteName}' not found.`));
                process.exit(1);
            }
            try {
                if (assetId) {
                    const asset = await getAsset(assetId);
                    await pushAsset(remote, asset);
                    console.log(chalk.green(`Pushed asset ${assetId}`));
                } else {
                    const assets = await listAssets();
                    for (const asset of assets) {
                        await pushAsset(remote, asset);
                        console.log(chalk.green(`Pushed ${asset.id}`));
                    }
                    console.log(chalk.bold(`Pushed ${assets.length} assets.`));
                }
            } catch (err) {
                console.error(chalk.red(`Push failed: ${(err as Error).message}`));
                process.exit(1);
            }
        });
}