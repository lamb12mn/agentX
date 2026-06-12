import { homedir } from 'os';
import { join } from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { getRemote } from '../../../remote/config.js';
import { fetchAssets, fetchAsset } from '../../../remote/client.js';
import { createAsset, updateAsset } from '../../../store/assets.js';

/**
 * Register the `pull` command — pull assets from a remote endpoint
 */
export function registerPull(program: Command) {
    program
        .command('pull <remote> [assetId]')
        .description('Pull assets from remote (if assetId omitted, pull all)')
        .action(async (remoteName: string, assetId?: string) => {
            const remote = getRemote(remoteName);
            if (!remote) {
                console.error(chalk.red(`Remote '${remoteName}' not found.`));
                process.exit(1);
            }
            const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
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
        });
}