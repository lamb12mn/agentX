/**
 * Credential Vault — AES-256-GCM encrypted credential storage
 * with OS keychain integration via keytar.
 *
 * Storage tiers:
 *   Tier 1: OS Keychain (keytar) — primary secret value storage
 *            macOS: Keychain Services, Windows: Credential Manager, Linux: libsecret
 *   Tier 2: Encrypted file (~/.agentx/vault/credentials.enc) — fallback + metadata
 *
 * File format: salt(16) + iv(12) + ciphertext + authTag(16), base64-encoded
 * Key derivation: PBKDF2 (100k iterations, SHA-512)
 *
 * The encrypted file ALWAYS stores complete entries (key + value + scope + timestamps).
 * The keychain mirrors only the secret values for OS-level protection.
 * This ensures export/import always work regardless of keychain availability.
 */

import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';
import { readFile, writeFile, mkdir, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// ── Constants ──────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;   // 256 bits
const IV_LENGTH = 12;    // GCM recommended nonce
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha512';
const VAULT_DIR_ENV = 'AGENTX_VAULT_DIR';
const DEFAULT_VAULT_DIR = join(homedir(), '.agentx', 'vault');
const CREDENTIALS_FILE = 'credentials.enc';
const AUDIT_FILE = 'audit.log';
const KEYTAR_SERVICE = 'agentx';

// ── Types ───────────────────────────────────────────────────────────────────

export interface VaultEntry {
  key: string;
  value: string;
  scope: string[];
  createdAt: number;
  updatedAt: number;
  autoRotateDays?: number;
}

export type VaultAuditAction = 'store' | 'get' | 'delete' | 'list' | 'export' | 'import' | 'init';

export interface VaultAuditEntry {
  action: VaultAuditAction;
  key: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

interface VaultStorage {
  entries: Record<string, VaultEntry>;
}

/** keytar-compatible interface for keychain backends */
export interface KeychainBackend {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getVaultDir(): string {
  return process.env[VAULT_DIR_ENV] ?? DEFAULT_VAULT_DIR;
}

function getCredentialsPath(): string {
  return join(getVaultDir(), CREDENTIALS_FILE);
}

function getAuditPath(): string {
  return join(getVaultDir(), AUDIT_FILE);
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
}

function encrypt(plaintext: string, passphrase: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: salt || iv || ciphertext || authTag
  return Buffer.concat([salt, iv, encrypted, authTag]).toString('base64');
}

function decrypt(encoded: string, passphrase: string): string {
  const data = Buffer.from(encoded, 'base64');
  if (data.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    throw new Error('Vault: corrupted data — too short');
  }
  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = data.subarray(data.length - TAG_LENGTH);
  const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH, data.length - TAG_LENGTH);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf-8');
}

function getPassphrase(passphrase?: string): string {
  const p = passphrase ?? process.env.AGENTX_VAULT_PASSPHRASE;
  if (!p) throw new Error('Vault passphrase required. Set AGENTX_VAULT_PASSPHRASE env or pass explicitly.');
  return p;
}

// ── CredentialVault ─────────────────────────────────────────────────────────

export class CredentialVault {
  private initialized = false;
  private keychain: KeychainBackend | null | undefined = undefined; // null = tried & failed

  /**
   * Initialise the vault directory (idempotent).
   * Creates ~/.agentx/vault/ if it does not exist,
   * and attempts to load the OS keychain backend.
   */
  async init(): Promise<void> {
    const dir = getVaultDir();
    await mkdir(dir, { recursive: true });
    this.keychain = await this.loadKeychainBackend();
    this.initialized = true;
  }

  /** Attempt to load the keytar keychain backend */
  private async loadKeychainBackend(): Promise<KeychainBackend | null> {
    if (process.env.AGENTX_VAULT_DISABLE_KEYCHAIN === 'true') {
      return null;
    }
    try {
      // keytar is a CJS native module — use namespace import for compatibility
      const keytar = await import('keytar') as { default?: KeychainBackend; setPassword: Function; getPassword: Function; deletePassword: Function; findCredentials: Function };
      const impl = keytar.default ?? keytar;
      return {
        setPassword: impl.setPassword.bind(impl),
        getPassword: impl.getPassword.bind(impl),
        deletePassword: impl.deletePassword.bind(impl),
        findCredentials: impl.findCredentials.bind(impl),
      };
    } catch {
      // keytar not installed or native module failed to load — use file-only fallback
      return null;
    }
  }

  /** Ensure vault directory exists before any operation */
  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      const dir = getVaultDir();
      if (!existsSync(dir)) {
        throw new Error('Vault not initialized. Call vault.init() first.');
      }
      this.initialized = true;
      // keychain loading was skipped if init() wasn't called — try now
      if (this.keychain === undefined) {
        this.keychain = await this.loadKeychainBackend();
      }
    }
  }

  /**
   * Store a credential. Creates or overwrites.
   *
   * When keychain is available:
   *   - Secret value stored in OS keychain (primary)
   *   - Full entry (with value) stored in encrypted file (backup + metadata)
   * When keychain is unavailable:
   *   - Full entry stored only in encrypted file
   *
   * @param entry Credential data
   * @param passphrase Optional passphrase (defaults to AGENTX_VAULT_PASSPHRASE)
   */
  async store(
    entry: Omit<VaultEntry, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number },
    passphrase?: string,
  ): Promise<void> {
    await this.ensureInit();
    const pw = getPassphrase(passphrase);
    const storage = await this.readStorage(pw);
    const now = Date.now();
    const existing = storage.entries[entry.key];

    const vaultEntry: VaultEntry = {
      key: entry.key,
      value: entry.value,
      scope: entry.scope,
      createdAt: entry.createdAt ?? existing?.createdAt ?? now,
      updatedAt: entry.updatedAt ?? now,
      autoRotateDays: entry.autoRotateDays ?? existing?.autoRotateDays,
    };

    storage.entries[entry.key] = vaultEntry;

    // Write to encrypted file (always — canonical store for metadata + fallback)
    await this.writeStorage(storage, pw);

    // Write to OS keychain if available (primary secret value store)
    if (this.keychain) {
      try {
        await this.keychain.setPassword(KEYTAR_SERVICE, entry.key, entry.value);
      } catch {
        // Keychain write failed — still stored in encrypted file, so no data loss
      }
    }

    await this.appendAudit({ action: 'store', key: entry.key, timestamp: now, success: true });
  }

  /**
   * Retrieve a credential value.
   *
   * Lookup order:
   *   1. OS keychain (if available) — fastest, most secure
   *   2. Encrypted file — fallback
   *
   * @returns The credential value, or null if not found.
   */
  async get(key: string, passphrase?: string): Promise<string | null> {
    await this.ensureInit();

    // Try OS keychain first (primary store for secret values)
    if (this.keychain) {
      try {
        const val = await this.keychain.getPassword(KEYTAR_SERVICE, key);
        if (val !== null) {
          await this.appendAudit({ action: 'get', key, timestamp: Date.now(), success: true });
          return val;
        }
      } catch {
        // Keychain read failed — fall through to file
      }
    }

    // Fall back to encrypted file
    const pw = getPassphrase(passphrase);
    const storage = await this.readStorage(pw);
    const entry = storage.entries[key];
    await this.appendAudit({ action: 'get', key, timestamp: Date.now(), success: !!entry });
    return entry?.value ?? null;
  }

  /**
   * List all stored credential metadata (keys + scopes, never values).
   * Always reads from the encrypted file (canonical metadata store).
   */
  async list(passphrase?: string): Promise<Array<{ key: string; scope: string[] }>> {
    await this.ensureInit();
    const pw = getPassphrase(passphrase);
    const storage = await this.readStorage(pw);
    const keys = Object.values(storage.entries).map(e => ({ key: e.key, scope: e.scope }));
    await this.appendAudit({ action: 'list', key: '*', timestamp: Date.now(), success: true });
    return keys;
  }

  /**
   * Delete a credential.
   * Removes from both keychain (if available) and encrypted file.
   * @returns true if deleted, false if key did not exist.
   */
  async delete(key: string, passphrase?: string): Promise<boolean> {
    await this.ensureInit();

    // Validate passphrase before any side-effects (prevents keychain↔file inconsistency)
    const pw = getPassphrase(passphrase);

    // Delete from OS keychain (best-effort — may not exist there)
    if (this.keychain) {
      try {
        await this.keychain.deletePassword(KEYTAR_SERVICE, key);
      } catch {
        // Keychain delete failed — continue with file deletion
      }
    }

    // Delete from encrypted file
    const storage = await this.readStorage(pw);
    if (!storage.entries[key]) {
      await this.appendAudit({ action: 'delete', key, timestamp: Date.now(), success: false, error: 'not found' });
      return false;
    }
    delete storage.entries[key];
    await this.writeStorage(storage, pw);
    await this.appendAudit({ action: 'delete', key, timestamp: Date.now(), success: true });
    return true;
  }

  /**
   * Read audit log entries.
   */
  async getAuditLog(limit = 50): Promise<VaultAuditEntry[]> {
    const path = getAuditPath();
    if (!existsSync(path)) return [];
    const raw = await readFile(path, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());
    // Most recent first, limited
    return lines
      .reverse()
      .slice(0, limit)
      .map(line => JSON.parse(line) as VaultAuditEntry);
  }

  /**
   * Export — encrypt all credentials with a separate backup passphrase and
   * return the base64-encoded blob.
   *
   * The blob includes actual secret values because it is encrypted with the
   * backup passphrase — it is NOT plaintext.
   */
  async export(backupPassphrase: string, vaultPassphrase?: string): Promise<string> {
    await this.ensureInit();
    const pw = getPassphrase(vaultPassphrase);
    const storage = await this.readStorage(pw);
    const encrypted = encrypt(JSON.stringify(storage), backupPassphrase);
    await this.appendAudit({ action: 'export', key: '*', timestamp: Date.now(), success: true });
    return encrypted;
  }

  /**
   * Import — decrypt a backup and merge credentials into the current vault.
   * @returns Number of credentials imported.
   */
  async import(encryptedData: string, backupPassphrase: string, vaultPassphrase?: string): Promise<number> {
    await this.ensureInit();
    const pw = getPassphrase(vaultPassphrase);
    const decrypted = decrypt(encryptedData, backupPassphrase);
    const imported: VaultStorage = JSON.parse(decrypted);
    const storage = await this.readStorage(pw);
    let count = 0;
    for (const [key, entry] of Object.entries(imported.entries)) {
      if (!storage.entries[key]) {
        storage.entries[key] = {
          ...entry,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        count++;
      }
    }
    if (count > 0) {
      await this.writeStorage(storage, pw);
      // Also sync to keychain if available
      if (this.keychain) {
        for (const [key, entry] of Object.entries(imported.entries)) {
          try {
            await this.keychain.setPassword(KEYTAR_SERVICE, key, entry.value);
          } catch {
            // best-effort
          }
        }
      }
    }
    await this.appendAudit({ action: 'import', key: '*', timestamp: Date.now(), success: true });
    return count;
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private async readStorage(passphrase: string): Promise<VaultStorage> {
    const path = getCredentialsPath();
    if (!existsSync(path)) {
      return { entries: {} };
    }
    const raw = await readFile(path, 'utf-8');
    try {
      const json = decrypt(raw.trim(), passphrase);
      return JSON.parse(json) as VaultStorage;
    } catch (e) {
      throw new Error(
        `Failed to decrypt vault (wrong passphrase or corrupted data): ${(e as Error).message}`,
      );
    }
  }

  private async writeStorage(storage: VaultStorage, passphrase: string): Promise<void> {
    const json = JSON.stringify(storage);
    const encrypted = encrypt(json, passphrase);
    await writeFile(getCredentialsPath(), encrypted, 'utf-8');
  }

  private async appendAudit(entry: VaultAuditEntry): Promise<void> {
    const path = getAuditPath();
    const dir = dirname(path);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const line = JSON.stringify(entry) + '\n';
    await appendFile(path, line, 'utf-8');
  }

  // ── Query ────────────────────────────────────────────────────────────────

  /** Check whether the vault file exists (i.e. has been initialized with data) */
  isSealed(): boolean {
    return existsSync(getCredentialsPath());
  }

  /** Check whether OS keychain backend is available */
  hasKeychain(): boolean {
    return this.keychain !== null;
  }
}
