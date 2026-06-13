/**
 * CLI vault command group — manage the credential vault.
 *
 * Subcommands:
 *   init    — Initialize vault directory
 *   set     — Store a credential
 *   get     — Retrieve a credential (obfuscated)
 *   list    — List all credential keys
 *   delete  — Remove a credential
 *   rotate  — Rotate a credential (update value)
 *   audit   — Show audit log
 *   export  — Export encrypted backup
 *   import  — Import encrypted backup
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { input, password } from '@inquirer/prompts';
import { CredentialVault } from '../../security/vault.js';

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Create a fresh vault instance, auto-initialized */
async function createVault(): Promise<CredentialVault> {
  const vault = new CredentialVault();
  await vault.init();
  return vault;
}

/** Get passphrase from option, env, or prompt */
async function resolvePassphrase(optPassphrase?: string): Promise<string> {
  if (optPassphrase) return optPassphrase;
  if (process.env.AGENTX_VAULT_PASSPHRASE) return process.env.AGENTX_VAULT_PASSPHRASE;
  // Prompt interactively
  return await password({ message: 'Enter vault passphrase:', mask: true });
}

/** Format a credential value for display — show last 4 chars only */
function obfuscateValue(value: string): string {
  if (value.length <= 4) return '****';
  const visible = value.slice(-4);
  return `****${visible}`;
}

/** Print a success message */
function success(msg: string): void {
  console.log(chalk.green('✓'), msg);
}

/** Print an error and exit */
function fail(msg: string, code = 1): never {
  console.error(chalk.red('✗'), msg);
  process.exit(code);
}

// ── Subcommand handlers ────────────────────────────────────────────────────

async function handleInit(): Promise<void> {
  await createVault();
  success(`Vault initialized at ${process.env.AGENTX_VAULT_DIR ?? '~/.agentx/vault'}`);
}

async function handleSet(
  key: string,
  value: string,
  opts: { scope?: string; passphrase?: string; autoRotateDays?: string },
): Promise<void> {
  const pw = await resolvePassphrase(opts.passphrase);
  const vault = await createVault();
  const scope = opts.scope ? opts.scope.split(',').map(s => s.trim()).filter(Boolean) : [];
  const autoRotateDays = opts.autoRotateDays ? parseInt(opts.autoRotateDays, 10) : undefined;

  await vault.store({ key, value, scope, autoRotateDays }, pw);
  success(`Stored credential: ${chalk.bold(key)}`);
  if (scope.length > 0) {
    console.log(chalk.dim(`  Scope: ${scope.join(', ')}`));
  }
}

async function handleGet(
  key: string,
  opts: { passphrase?: string },
): Promise<void> {
  const pw = await resolvePassphrase(opts.passphrase);
  const vault = await createVault();

  const value = await vault.get(key, pw);
  if (value === null) {
    fail(`Credential not found: ${key}`);
  }
  console.log(`${chalk.bold(key)}: ${chalk.cyan(obfuscateValue(value))}`);
  console.log(chalk.dim(`  (showing last 4 characters; use --raw to see full value)`));
}

async function handleGetRaw(
  key: string,
  opts: { passphrase?: string },
): Promise<void> {
  const pw = await resolvePassphrase(opts.passphrase);
  const vault = await createVault();

  const value = await vault.get(key, pw);
  if (value === null) {
    fail(`Credential not found: ${key}`);
  }
  console.log(value);
}

async function handleList(opts: { passphrase?: string }): Promise<void> {
  const pw = await resolvePassphrase(opts.passphrase);
  const vault = await createVault();

  const entries = await vault.list(pw);
  if (entries.length === 0) {
    console.log(chalk.yellow('No credentials stored.'));
    return;
  }

  console.log(chalk.bold(`\n  ${entries.length} credential(s) stored:\n`));
  for (const entry of entries) {
    const scopeStr = entry.scope.length > 0
      ? chalk.dim(` [${entry.scope.join(', ')}]`)
      : '';
    console.log(`  ${chalk.cyan('•')} ${chalk.bold(entry.key)}${scopeStr}`);
  }
  console.log(); // trailing newline
}

async function handleDelete(
  key: string,
  opts: { passphrase?: string; force?: boolean },
): Promise<void> {
  const pw = await resolvePassphrase(opts.passphrase);
  const vault = await createVault();

  // Confirm unless --force
  if (!opts.force) {
    const confirmed = await input({
      message: `Delete credential "${key}"? (yes/no):`,
      validate: (val: string) => ['yes', 'no'].includes(val.toLowerCase()) || 'Type "yes" or "no"',
    });
    if (confirmed.toLowerCase() !== 'yes') {
      console.log(chalk.yellow('Delete cancelled.'));
      return;
    }
  }

  const deleted = await vault.delete(key, pw);
  if (!deleted) {
    fail(`Credential not found: ${key}`);
  }
  success(`Deleted credential: ${chalk.bold(key)}`);
}

async function handleRotate(
  key: string,
  opts: { passphrase?: string; value?: string },
): Promise<void> {
  const pw = await resolvePassphrase(opts.passphrase);
  const vault = await createVault();

  // Check that the credential exists first
  const existingValue = await vault.get(key, pw);
  if (existingValue === null) {
    fail(`Credential not found: ${key}. Use "agentx vault set" to create it first.`);
  }

  // Get new value (from option or prompt)
  const newValue = opts.value ?? await password({
    message: `New value for "${key}":`,
    mask: true,
    validate: (val: string) => val.length > 0 || 'Value is required',
  });

  // store() internally reads the existing entry and preserves scope,
  // autoRotateDays, and createdAt from the existing storage — no need
  // to fetch them explicitly. Passing only key/value is sufficient.
  await vault.store({ key, value: newValue, updatedAt: Date.now(), scope: [] }, pw);
  success(`Rotated credential: ${chalk.bold(key)}`);
}

async function handleAudit(opts: { limit?: string }): Promise<void> {
  const vault = await createVault();
  const limit = opts.limit ? parseInt(opts.limit, 10) : 50;

  const entries = await vault.getAuditLog(limit);
  if (entries.length === 0) {
    console.log(chalk.yellow('No audit entries.'));
    return;
  }

  console.log(chalk.bold(`\n  Last ${entries.length} audit entr${entries.length === 1 ? 'y' : 'ies'}:\n`));
  for (const entry of entries) {
    const icon = entry.success ? chalk.green('✓') : chalk.red('✗');
    const date = new Date(entry.timestamp).toISOString().replace('T', ' ').slice(0, 19);
    const errStr = entry.error ? chalk.red(` (${entry.error})`) : '';
    console.log(`  ${icon} ${chalk.cyan(entry.action.padEnd(8))} ${chalk.bold(entry.key)} ${chalk.dim(date)}${errStr}`);
  }
  console.log();
}

async function handleExport(opts: { passphrase?: string }): Promise<void> {
  const pw = await resolvePassphrase(opts.passphrase);

  // Require a separate backup passphrase
  const backupPass = await password({
    message: 'Enter a backup passphrase (different from vault passphrase):',
    mask: true,
    validate: (val: string) => val.length >= 8 || 'Backup passphrase must be at least 8 characters',
  });
  const backupConfirm = await password({
    message: 'Confirm backup passphrase:',
    mask: true,
  });
  if (backupPass !== backupConfirm) {
    fail('Backup passphrases do not match.');
  }

  const vault = await createVault();
  const blob = await vault.export(backupPass, pw);

  console.log(chalk.bold('\nEncrypted backup blob:'));
  console.log(chalk.dim(`  (${blob.length} characters, decrypt with backup passphrase)\n`));
  console.log(blob);
  console.log();
  success('Export complete. Save the blob and backup passphrase securely.');
}

async function handleImport(
  opts: { passphrase?: string; file?: string },
): Promise<void> {
  const pw = await resolvePassphrase(opts.passphrase);

  // Get the encrypted blob
  let blob: string;
  if (opts.file) {
    const fs = await import('fs/promises');
    try {
      blob = (await fs.readFile(opts.file, 'utf-8')).trim();
    } catch (e) {
      fail(`Cannot read file: ${opts.file} — ${(e as Error).message}`);
    }
  } else {
    blob = await input({
      message: 'Paste the encrypted backup blob:',
      validate: (val: string) => val.length > 50 || 'Blob appears too short — paste the full base64 blob',
    });
  }

  const backupPass = await password({
    message: 'Enter backup passphrase:',
    mask: true,
  });

  const vault = await createVault();
  try {
    const count = await vault.import(blob, backupPass, pw);
    if (count === 0) {
      console.log(chalk.yellow('No new credentials to import (all keys already exist).'));
    } else {
      success(`Imported ${count} credential(s).`);
    }
  } catch (e) {
    fail(`Import failed: ${(e as Error).message}. Wrong backup passphrase or corrupted data.`);
  }
}

// ── Command registration ───────────────────────────────────────────────────

export function registerVaultCommand(program: Command): void {
  const vault = program
    .command('vault')
    .description('Manage encrypted credential vault (AES-256-GCM + OS keychain)');

  vault
    .command('init')
    .description('Initialize the credential vault directory')
    .action(handleInit);

  vault
    .command('set <key> <value>')
    .description('Store a credential (encrypted with AES-256-GCM)')
    .option('-s, --scope <scope>', 'Comma-separated feature scopes (e.g. "mcp.github,mcp.vscode")')
    .option('-r, --auto-rotate-days <days>', 'Auto-rotation interval in days')
    .option('-p, --passphrase <pass>', 'Vault passphrase (or set AGENTX_VAULT_PASSPHRASE)')
    .action(handleSet);

  vault
    .command('get <key>')
    .description('Retrieve a credential (shows last 4 characters)')
    .option('-p, --passphrase <pass>', 'Vault passphrase (or set AGENTX_VAULT_PASSPHRASE)')
    .action(handleGet);

  vault
    .command('get-raw <key>')
    .description('Retrieve a credential (full value, use with care)')
    .option('-p, --passphrase <pass>', 'Vault passphrase (or set AGENTX_VAULT_PASSPHRASE)')
    .action(handleGetRaw);

  vault
    .command('list')
    .description('List all stored credential keys and scopes (never values)')
    .option('-p, --passphrase <pass>', 'Vault passphrase (or set AGENTX_VAULT_PASSPHRASE)')
    .action(handleList);

  vault
    .command('delete <key>')
    .description('Delete a credential')
    .option('-p, --passphrase <pass>', 'Vault passphrase (or set AGENTX_VAULT_PASSPHRASE)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(handleDelete);

  vault
    .command('rotate <key>')
    .description('Rotate (update) a credential value')
    .option('-v, --value <value>', 'New value (prompted if not provided)')
    .option('-p, --passphrase <pass>', 'Vault passphrase (or set AGENTX_VAULT_PASSPHRASE)')
    .action(handleRotate);

  vault
    .command('audit')
    .description('Show audit log entries (most recent first)')
    .option('-l, --limit <count>', 'Max entries to show', '50')
    .action(handleAudit);

  vault
    .command('export')
    .description('Export all credentials as encrypted backup (requires separate backup passphrase)')
    .option('-p, --passphrase <pass>', 'Vault passphrase (or set AGENTX_VAULT_PASSPHRASE)')
    .action(handleExport);

  vault
    .command('import')
    .description('Import credentials from an encrypted backup')
    .option('-p, --passphrase <pass>', 'Vault passphrase (or set AGENTX_VAULT_PASSPHRASE)')
    .option('-f, --file <path>', 'Read backup blob from file instead of stdin')
    .action(handleImport);
}
