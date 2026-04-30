import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { statSync } from 'fs';
import { initDb } from '../../store/db.js';
import { listAssets } from '../../store/assets.js';
import chalk from 'chalk';
import type { AssetType } from '../../types.js';

const TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'];

export function registerInfoCommand(program: Command): void {
  program
    .command('info')
    .description('Show asset library statistics')
    .action(async () => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      const dbPath = join(baseDir, 'agentx.db');
      initDb(dbPath);

      const counts: Record<string, number> = {};
      let total = 0;
      for (const t of TYPES) {
        const n = (await listAssets(t)).length;
        counts[t] = n;
        total += n;
      }

      let dbSize = 'unknown';
      try {
        const bytes = statSync(dbPath).size;
        dbSize = bytes < 1024 * 1024
          ? `${Math.round(bytes / 1024)} KB`
          : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
      } catch { /* db may not exist yet */ }

      console.log(chalk.bold(`AgentX Asset Library (${baseDir})`));
      for (const t of TYPES) {
        console.log(`  ${chalk.cyan((t + 's:').padEnd(12))} ${counts[t]}`);
      }
      console.log(`  ${chalk.dim('─'.repeat(20))}`);
      console.log(`  ${chalk.cyan('total:'.padEnd(12))} ${total} assets`);
      console.log(`  ${chalk.cyan('db:'.padEnd(12))} ${dbPath} (${dbSize})`);
    });
}
