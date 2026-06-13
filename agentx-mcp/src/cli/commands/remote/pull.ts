import { Command } from 'commander';
import chalk from 'chalk';
import { getRemote } from '../../../remote/config.js';
import { fetchAssets, fetchAsset } from '../../../remote/client.js';
import { createAsset } from '../../../store/assets.js';
import { getBaseDir, withDb } from '../../../cli/common.js';

/**
 * Register the `pull` command — pull assets from a remote endpoint
 */
export function registerPull(remote: Command) {
    remote
        .command('pull <remote> [assetId]')
        .description('Pull assets from remote (if assetId omitted, pull all)')
        .action(withDb(async (remoteName: string, assetId?: string) => {
            const remote = getRemote(remoteName);
            if (!remote) {
                console.error(chalk.red(`Remote '${remoteName}' not found.`));
                process.exit(1);
            }
            const baseDir = getBaseDir();
            try {
                if (assetId) {
                    const asset = await fetchAsset(remote, assetId);
                    await createAsset(asset, asset.content, baseDir);
                    console.log(chalk.green(`Pulled asset ${assetId}`));
                } else {
                    const assets = await fetchAssets(remote);
                    for (const asset of assets) {
                        await createAsset(asset, asset.content, baseDir);
                        console.log(chalk.green(`Pulled ${asset.id}`));
                    }
                    console.log(chalk.bold(`Pulled ${assets.length} assets.`));
                }
            } catch (err) {
                console.error(chalk.red(`Pull failed: ${(err as Error).message}`));
                process.exit(1);
            }
        }));
}