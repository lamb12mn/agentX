import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CredentialVault, KeychainBackend } from '../../src/security/vault.js';

const TEST_PASSPHRASE = 'test-passphrase-123!';

/** A mock keychain backend for testing keychain integration */
function createMockKeychain(): KeychainBackend {
  const store = new Map<string, string>();
  return {
    setPassword: async (service, account, password) => {
      store.set(`${service}:${account}`, password);
    },
    getPassword: async (service, account) => {
      return store.get(`${service}:${account}`) ?? null;
    },
    deletePassword: async (service, account) => {
      return store.delete(`${service}:${account}`);
    },
    findCredentials: async (service) => {
      return Array.from(store.entries())
        .filter(([k]) => k.startsWith(service + ':'))
        .map(([k, v]) => ({ account: k.split(':')[1], password: v }));
    },
  };
}

describe('CredentialVault', () => {
  let tmpDir: string;
  let vault: CredentialVault;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-vault-test-'));
    // Point vault to temp directory via env
    process.env.AGENTX_VAULT_DIR = tmpDir;
    process.env.AGENTX_VAULT_PASSPHRASE = TEST_PASSPHRASE;
    // Force file-only mode for basic tests (no keytar dependency)
    process.env.AGENTX_VAULT_DISABLE_KEYCHAIN = 'true';
    vault = new CredentialVault();
    await vault.init();
  });

  afterEach(() => {
    delete process.env.AGENTX_VAULT_DIR;
    delete process.env.AGENTX_VAULT_PASSPHRASE;
    delete process.env.AGENTX_VAULT_DISABLE_KEYCHAIN;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isSealed returns false before any credential stored', () => {
    expect(vault.isSealed()).toBe(false);
  });

  it('store saves a credential and get retrieves it', async () => {
    await vault.store({ key: 'github-token', value: 'ghp_abc123', scope: ['mcp.github'] });
    const val = await vault.get('github-token');
    expect(val).toBe('ghp_abc123');
  });

  it('isSealed returns true after storing a credential', async () => {
    await vault.store({ key: 'test', value: 'val', scope: [] });
    expect(vault.isSealed()).toBe(true);
  });

  it('get returns null for nonexistent key', async () => {
    const val = await vault.get('nonexistent');
    expect(val).toBeNull();
  });

  it('list returns keys and scopes (never values)', async () => {
    await vault.store({ key: 'token-a', value: 'secret-a', scope: ['service-a'] });
    await vault.store({ key: 'token-b', value: 'secret-b', scope: ['service-b', 'service-c'] });

    const entries = await vault.list();
    expect(entries).toHaveLength(2);

    const a = entries.find(e => e.key === 'token-a');
    expect(a).toBeDefined();
    expect(a!.scope).toEqual(['service-a']);

    const b = entries.find(e => e.key === 'token-b');
    expect(b).toBeDefined();
    expect(b!.scope).toEqual(['service-b', 'service-c']);
  });

  it('list returns empty array when no credentials stored', async () => {
    const entries = await vault.list();
    expect(entries).toEqual([]);
  });

  it('delete removes a credential', async () => {
    await vault.store({ key: 'to-delete', value: 'bye', scope: [] });
    const deleted = await vault.delete('to-delete');
    expect(deleted).toBe(true);
    const val = await vault.get('to-delete');
    expect(val).toBeNull();
  });

  it('delete returns false for nonexistent key', async () => {
    const deleted = await vault.delete('nonexistent');
    expect(deleted).toBe(false);
  });

  it('list does not expose values', async () => {
    await vault.store({ key: 'secret-key', value: 'my-secret-value', scope: [] });
    const entries = await vault.list();
    const entry = entries[0];
    expect(entry).not.toHaveProperty('value');
    expect(JSON.stringify(entries)).not.toContain('my-secret-value');
  });

  it('persists data across vault instances', async () => {
    await vault.store({ key: 'persist-me', value: 'persisted-value', scope: ['test'] });

    // Create a new vault instance pointing to same dir
    const vault2 = new CredentialVault();
    await vault2.init();
    const val = await vault2.get('persist-me');
    expect(val).toBe('persisted-value');
  });

  it('audit log records store/get/delete actions', async () => {
    await vault.store({ key: 'audit-test', value: 'val', scope: [] });
    await vault.get('audit-test');
    await vault.delete('audit-test');

    const log = await vault.getAuditLog();
    expect(log.length).toBeGreaterThanOrEqual(3);
    expect(log.some(e => e.action === 'store' && e.key === 'audit-test' && e.success)).toBe(true);
    expect(log.some(e => e.action === 'get' && e.key === 'audit-test' && e.success)).toBe(true);
    expect(log.some(e => e.action === 'delete' && e.key === 'audit-test' && e.success)).toBe(true);
  });

  it('throws on wrong passphrase', async () => {
    await vault.store({ key: 'pw-test', value: 'secret', scope: [] });

    process.env.AGENTX_VAULT_PASSPHRASE = 'wrong-passphrase';
    const vault2 = new CredentialVault();
    await expect(vault2.get('pw-test')).rejects.toThrow('Failed to decrypt vault');
  });

  it('export creates encrypted blob', async () => {
    await vault.store({ key: 'export-me', value: 'export-val', scope: ['test'] });
    const blob = await vault.export('backup-pass');
    expect(typeof blob).toBe('string');
    expect(blob.length).toBeGreaterThan(50);
  });

  it('init is idempotent (multiple calls do not error)', async () => {
    await vault.init();
    await vault.init();
    await vault.init();
    // Should not throw
    expect(true).toBe(true);
  });

  it('overwrites existing credential on store with same key', async () => {
    await vault.store({ key: 'update-me', value: 'old-val', scope: ['a'] });
    await vault.store({ key: 'update-me', value: 'new-val', scope: ['b'] });

    const val = await vault.get('update-me');
    expect(val).toBe('new-val');

    const entries = await vault.list();
    const entry = entries.find(e => e.key === 'update-me');
    expect(entry!.scope).toEqual(['b']);
  });

  it('store with autoRotateDays persists the field', async () => {
    await vault.store({ key: 'rotate-me', value: 'val', scope: [], autoRotateDays: 90 });
    const log = await vault.getAuditLog();
    expect(log.some(e => e.action === 'store' && e.key === 'rotate-me')).toBe(true);
    const val = await vault.get('rotate-me');
    expect(val).toBe('val');
  });

  it('hasKeychain returns false when DISABLE_KEYCHAIN is set', async () => {
    expect(vault.hasKeychain()).toBe(false);
  });
});

// ── Keychain-specific tests ─────────────────────────────────────────────────

describe('CredentialVault with mock keychain backend', () => {
  let tmpDir: string;
  let vault: CredentialVault;
  let mockKeychain: KeychainBackend;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-vault-kc-test-'));
    process.env.AGENTX_VAULT_DIR = tmpDir;
    process.env.AGENTX_VAULT_PASSPHRASE = TEST_PASSPHRASE;
    // Do NOT set DISABLE_KEYCHAIN — we'll inject a mock keychain programmatically
    vault = new CredentialVault();
    await vault.init();

    // Override the keychain property with a mock backend
    // We need to use type assertion to access private property
    mockKeychain = createMockKeychain();
    (vault as unknown as { keychain: KeychainBackend | null | undefined }).keychain = mockKeychain;
  });

  afterEach(() => {
    delete process.env.AGENTX_VAULT_DIR;
    delete process.env.AGENTX_VAULT_PASSPHRASE;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hasKeychain returns true after mock injection', () => {
    expect(vault.hasKeychain()).toBe(true);
  });

  it('store writes to both keychain and file', async () => {
    await vault.store({ key: 'dual-store', value: 'dual-value', scope: [] });

    // Value should be in keychain
    const kcVal = await mockKeychain.getPassword('agentx', 'dual-store');
    expect(kcVal).toBe('dual-value');

    // Value should also be retrievable via vault.get
    const val = await vault.get('dual-store');
    expect(val).toBe('dual-value');
  });

  it('get reads from keychain when available', async () => {
    // Write only to keychain (simulate OS keychain having the value but file being stale)
    await mockKeychain.setPassword('agentx', 'kc-only', 'kc-secret');

    const val = await vault.get('kc-only');
    expect(val).toBe('kc-secret');
  });

  it('get falls back to file when keychain has no match', async () => {
    // Write only to file
    await vault.store({ key: 'file-only', value: 'file-secret', scope: [] });

    // Remove from keychain
    await mockKeychain.deletePassword('agentx', 'file-only');

    const val = await vault.get('file-only');
    expect(val).toBe('file-secret');
  });

  it('delete removes from both keychain and file', async () => {
    await vault.store({ key: 'delete-both', value: 'delete-val', scope: [] });

    // Verify it's in both
    expect(await mockKeychain.getPassword('agentx', 'delete-both')).toBe('delete-val');

    // Delete
    const result = await vault.delete('delete-both');
    expect(result).toBe(true);

    // Verify keychain entry is gone
    expect(await mockKeychain.getPassword('agentx', 'delete-both')).toBeNull();

    // Verify vault entry is gone
    expect(await vault.get('delete-both')).toBeNull();
  });

  it('import syncs to keychain when available', async () => {
    // Export from a vault that has a credential
    await vault.store({ key: 'import-me', value: 'import-val', scope: ['test'] });
    const blob = await vault.export('backup-pass');

    // Create a new vault and import
    const tmpDir2 = mkdtempSync(join(tmpdir(), 'agentx-vault-import-'));
    process.env.AGENTX_VAULT_DIR = tmpDir2;
    const vault2 = new CredentialVault();
    await vault2.init();

    // Inject mock keychain on vault2
    const kc2 = createMockKeychain();
    (vault2 as unknown as { keychain: KeychainBackend | null | undefined }).keychain = kc2;

    const count = await vault2.import(blob, 'backup-pass');
    expect(count).toBe(1);

    // Credential should be in keychain of vault2
    const kcVal = await kc2.getPassword('agentx', 'import-me');
    expect(kcVal).toBe('import-val');

    rmSync(tmpDir2, { recursive: true, force: true });
  });

  it('hasKeychain correctly reports state', async () => {
    // With mock injected, it should return true
    expect(vault.hasKeychain()).toBe(true);

    // Create a vault with DISABLE_KEYCHAIN for comparison
    const tmpDir3 = mkdtempSync(join(tmpdir(), 'agentx-vault-nokc-'));
    process.env.AGENTX_VAULT_DIR = tmpDir3;
    process.env.AGENTX_VAULT_DISABLE_KEYCHAIN = 'true';
    const vault3 = new CredentialVault();
    await vault3.init();
    expect(vault3.hasKeychain()).toBe(false);

    rmSync(tmpDir3, { recursive: true, force: true });
  });
});
