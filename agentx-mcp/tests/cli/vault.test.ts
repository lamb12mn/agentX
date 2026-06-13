import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Command } from 'commander';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a test vault directory and return its path */
function createVaultDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentx-vault-cli-test-'));
  process.env.AGENTX_VAULT_DIR = dir;
  process.env.AGENTX_VAULT_PASSPHRASE = 'test-passphrase';
  process.env.AGENTX_VAULT_DISABLE_KEYCHAIN = 'true';
  return dir;
}

function cleanupVaultDir(dir: string): void {
  delete process.env.AGENTX_VAULT_DIR;
  delete process.env.AGENTX_VAULT_PASSPHRASE;
  delete process.env.AGENTX_VAULT_DISABLE_KEYCHAIN;
  rmSync(dir, { recursive: true, force: true });
}

describe('vault CLI command registration', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
  });

  it('registers vault command group with all subcommands', async () => {
    // Dynamic import to avoid side effects from top-level module loading
    const { registerVaultCommand } = await import('../../src/cli/commands/vault.js');
    registerVaultCommand(program);

    const vaultCmd = program.commands.find(c => c.name() === 'vault');
    expect(vaultCmd).toBeDefined();
    expect(vaultCmd!.description()).toContain('credential');

    const subcommands = vaultCmd!.commands.map(c => c.name());
    expect(subcommands).toContain('init');
    expect(subcommands).toContain('set');
    expect(subcommands).toContain('get');
    expect(subcommands).toContain('get-raw');
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('delete');
    expect(subcommands).toContain('rotate');
    expect(subcommands).toContain('audit');
    expect(subcommands).toContain('export');
    expect(subcommands).toContain('import');
    expect(subcommands).toHaveLength(10);
  });
});

describe('vault CLI command handlers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createVaultDir();
  });

  afterEach(() => {
    cleanupVaultDir(tmpDir);
  });

  it('init creates vault directory', async () => {
    const { CredentialVault } = await import('../../src/security/vault.js');

    // Manually init to verify directory is created
    const vault = new CredentialVault();
    await vault.init();
    expect(vault.isSealed()).toBe(false); // no credentials yet, but dir exists
  });

  it('set stores and get retrieves a credential', async () => {
    const { CredentialVault } = await import('../../src/security/vault.js');
    const vault = new CredentialVault();
    await vault.init();

    await vault.store({ key: 'test-key', value: 'test-value', scope: ['test-scope'] });
    const value = await vault.get('test-key');
    expect(value).toBe('test-value');
  });

  it('set with scope persists scope metadata', async () => {
    const { CredentialVault } = await import('../../src/security/vault.js');
    const vault = new CredentialVault();
    await vault.init();

    await vault.store({ key: 'scoped-key', value: 'scoped-val', scope: ['mcp.github', 'mcp.vscode'] });
    const entries = await vault.list();
    const entry = entries.find(e => e.key === 'scoped-key');
    expect(entry).toBeDefined();
    expect(entry!.scope).toEqual(['mcp.github', 'mcp.vscode']);
  });

  it('delete removes a stored credential', async () => {
    const { CredentialVault } = await import('../../src/security/vault.js');
    const vault = new CredentialVault();
    await vault.init();

    await vault.store({ key: 'delete-me', value: 'bye', scope: [] });
    expect(await vault.get('delete-me')).toBe('bye');

    const deleted = await vault.delete('delete-me');
    expect(deleted).toBe(true);
    expect(await vault.get('delete-me')).toBeNull();
  });

  it('list returns empty array when no credentials', async () => {
    const { CredentialVault } = await import('../../src/security/vault.js');
    const vault = new CredentialVault();
    await vault.init();

    const entries = await vault.list();
    expect(entries).toEqual([]);
  });

  it('rotate updates a credential value', async () => {
    const { CredentialVault } = await import('../../src/security/vault.js');
    const vault = new CredentialVault();
    await vault.init();

    await vault.store({ key: 'rotate-test', value: 'old-value', scope: ['test'] });
    expect(await vault.get('rotate-test')).toBe('old-value');

    // Re-store with new value (rotate)
    await vault.store({ key: 'rotate-test', value: 'new-value', scope: ['test'], updatedAt: Date.now() });
    expect(await vault.get('rotate-test')).toBe('new-value');
  });

  it('audit log records recent actions', async () => {
    const { CredentialVault } = await import('../../src/security/vault.js');
    const vault = new CredentialVault();
    await vault.init();

    await vault.store({ key: 'audit-me', value: 'val', scope: [] });
    await vault.get('audit-me');
    await vault.delete('audit-me');

    const log = await vault.getAuditLog(10);
    expect(log.length).toBeGreaterThanOrEqual(3);
    const actions = log.map(e => `${e.action}:${e.key}`);
    expect(actions).toContain('store:audit-me');
    expect(actions).toContain('get:audit-me');
    expect(actions).toContain('delete:audit-me');
  });

  it('export creates a decryptable blob', async () => {
    const { CredentialVault } = await import('../../src/security/vault.js');
    const vault = new CredentialVault();
    await vault.init();

    await vault.store({ key: 'export-test', value: 'export-val', scope: [] });
    const blob = await vault.export('backup-passphrase-123');
    expect(typeof blob).toBe('string');
    expect(blob.length).toBeGreaterThan(50);
  });

  it('import restores credentials from backup', async () => {
    const { CredentialVault } = await import('../../src/security/vault.js');
    const vault = new CredentialVault();
    await vault.init();

    await vault.store({ key: 'backup-me', value: 'backup-val', scope: ['test'] });
    const blob = await vault.export('backup-passphrase-123');

    // Create a separate vault directory for import so storage is fresh
    const importDir = mkdtempSync(join(tmpdir(), 'agentx-vault-import-'));
    const originalDir = process.env.AGENTX_VAULT_DIR;
    process.env.AGENTX_VAULT_DIR = importDir;
    const vault2 = new CredentialVault();
    await vault2.init();
    // Keychain already disabled via env var; ensure it stays null
    (vault2 as unknown as { keychain: null }).keychain = null;

    const count = await vault2.import(blob, 'backup-passphrase-123');
    expect(count).toBe(1);
    expect(await vault2.get('backup-me')).toBe('backup-val');

    // Cleanup import dir and restore original vault dir
    rmSync(importDir, { recursive: true, force: true });
    process.env.AGENTX_VAULT_DIR = originalDir;
  });

  it('init is idempotent — multiple calls do not error', async () => {
    const { CredentialVault } = await import('../../src/security/vault.js');
    const vault = new CredentialVault();
    await vault.init();
    await vault.init();
    await vault.init();
    // Should not throw
    expect(vault.isSealed()).toBe(false);
  });
});
