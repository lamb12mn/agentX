import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { listAssets, getAsset, readAssetContent } from '../../store/assets.js';
import chalk from 'chalk';
import yaml from 'js-yaml';
import type { AssetType } from '../../types.js';

/**
 * Validation result for a single asset
 */
interface ValidationEntry {
  id: string;
  name: string;
  type: AssetType;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'];

/**
 * Validate a single asset
 */
async function validateAsset(id: string): Promise<ValidationEntry> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const meta = await getAsset(id);
  if (!meta) {
    return { id, name: '', type: 'skill', valid: false, errors: [`Asset not found: ${id}`], warnings: [] };
  }

  // Basic validation
  if (!meta.name || meta.name.trim().length === 0) {
    errors.push('Name is empty');
  }
  if (meta.name && meta.name.length > 100) {
    warnings.push('Name exceeds 100 characters');
  }

  // Content validation for certain types
  if (['mcp', 'agent', 'workflow'].includes(meta.type)) {
    try {
      const content = await readAssetContent(id);
      if (content.trim()) {
        yaml.load(content);
      }
    } catch (e) {
      errors.push(`YAML parse error: ${e instanceof Error ? e.message : e}`);
    }
  }

  return {
    id: meta.id,
    name: meta.name,
    type: meta.type,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate all assets in database
 */
async function validateAll(): Promise<ValidationEntry[]> {
  initDb(join(process.env.AGENTX_DIR ?? join(homedir(), '.agentx'), 'agentx.db'));
  const results: ValidationEntry[] = [];

  for (const type of VALID_TYPES) {
    const assets = await listAssets(type);
    for (const asset of assets) {
      const result = await validateAsset(asset.id);
      results.push(result);
    }
  }

  return results;
}

export function registerValidateCommand(program: Command): void {
  program
    .command('validate [id]')
    .description('Validate asset integrity (optional asset ID)')
    .option('-t, --type <type>', `Filter by type: ${VALID_TYPES.join('|')}`)
    .option('-q, --quiet', 'Only show errors')
    .action(async (id?: string, options?: { type?: string; quiet?: boolean }) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      const results: ValidationEntry[] = [];

      if (id) {
        // Validate single asset
        results.push(await validateAsset(id));
      } else {
        // Validate all
        const type = options?.type as AssetType | undefined;
        if (type && !VALID_TYPES.includes(type)) {
          console.error(chalk.red(`Invalid type: ${type}`));
          process.exit(1);
        }

        const types = type ? [type] : VALID_TYPES;
        for (const t of types) {
          const assets = await listAssets(t);
          for (const asset of assets) {
            results.push(await validateAsset(asset.id));
          }
        }
      }

      // Output results
      const quiet = options?.quiet ?? false;
      let hasErrors = false;
      let hasWarnings = false;

      for (const r of results) {
        if (r.errors.length > 0) {
          hasErrors = true;
          console.log(chalk.red(`✗ ${r.name} (${r.type})`));
          r.errors.forEach(e => console.log(chalk.red(`  Error: ${e}`)));
        } else if (!quiet && r.warnings.length > 0) {
          hasWarnings = true;
          console.log(chalk.yellow(`⚠ ${r.name} (${r.type})`));
          r.warnings.forEach(w => console.log(chalk.yellow(`  Warning: ${w}`)));
        } else if (!quiet) {
          console.log(chalk.green(`✓ ${r.name} (${r.type})`));
        }
      }

      // Summary
      const total = results.length;
      const valid = results.filter(r => r.valid).length;
      const invalid = total - valid;

      console.log(chalk.dim(`\nValidated ${total} asset(s): ${valid} valid, ${invalid} invalid`));

      if (invalid > 0) {
        process.exit(1);
      }
    });
}