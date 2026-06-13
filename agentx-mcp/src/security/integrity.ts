/**
 * Config Integrity — SHA-256 checksum verification for detection of
 * unauthorized config file modifications.
 *
 * Tracks checksums of critical config files (remotes.json, agentx.db, etc.)
 * and detects when they have been modified outside of AgentX operations.
 *
 * Storage: ~/.agentx/vault/integrity.json
 */

import { createHash } from 'crypto';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import { homedir } from 'os';

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_AGENTX_DIR = join(homedir(), '.agentx');
const INTEGRITY_FILENAME = 'integrity.json';

// ── Types ──────────────────────────────────────────────────────────────────

export interface IntegrityEntry {
  /** Absolute path to the tracked file */
  filePath: string;
  /** SHA-256 hex digest */
  checksum: string;
  /** Unix timestamp of last verification */
  lastVerified: number;
  /** Algorithm used (only sha256 for now) */
  algorithm: 'sha256';
  /** Optional description of what this file is */
  label?: string;
}

export interface IntegrityResult {
  filePath: string;
  status: 'ok' | 'modified' | 'missing' | 'new';
  expectedChecksum?: string;
  actualChecksum?: string;
  label?: string;
}

interface IntegrityStore {
  version: 1;
  entries: IntegrityEntry[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getAgentxDir(): string {
  return process.env.AGENTX_DIR ?? DEFAULT_AGENTX_DIR;
}

function getIntegrityPath(): string {
  return join(getAgentxDir(), 'vault', INTEGRITY_FILENAME);
}

// ── ConfigIntegrity ─────────────────────────────────────────────────────────

export class ConfigIntegrity {
  private entries: IntegrityEntry[] = [];

  /**
   * Compute the SHA-256 checksum of a file.
   * Returns the hex-encoded digest, or throws if the file cannot be read.
   */
  static async computeChecksum(filePath: string): Promise<string> {
    const content = await readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Initialize integrity tracking for the default set of config files.
   *
   * Default files monitored (relative to AGENTX_DIR or ~/.agentx):
   *   - remotes.json          — Remote server configs (may contain API keys)
   *   - agentx.db             — SQLite asset database
   *   - vault/audit.log       — Vault audit trail
   *   - vault/integrity.json  — This file itself (self-integrity check)
   *
   * This is idempotent — only adds entries for files that exist and are
   * not already tracked.
   */
  async initialize(agentxDir?: string): Promise<void> {
    // Always load existing integrity data first (preserves custom tracked files across restarts)
    await this.load();

    const dir = agentxDir ?? getAgentxDir();
    const existingPaths = new Set(this.entries.map(e => e.filePath));
    const defaults = this.getDefaultFiles(dir);

    for (const filePath of defaults) {
      if (existingPaths.has(filePath)) continue;
      if (!existsSync(filePath)) continue;

      try {
        const checksum = await ConfigIntegrity.computeChecksum(filePath);
        this.entries.push({
          filePath,
          checksum,
          lastVerified: Date.now(),
          algorithm: 'sha256',
          label: this.guessLabel(filePath, dir),
        });
      } catch {
        // File disappeared between existsSync and read — skip
      }
    }

    // Ensure vault directory and save
    const vaultDir = join(dir, 'vault');
    if (!existsSync(vaultDir)) {
      await mkdir(vaultDir, { recursive: true });
    }
    await this.save();
  }

  /** Ensure integrity.json exists (for self-integrity check) — called after first save */
  async ensureSelfTracked(): Promise<void> {
    await this.load();
    const integrityJson = getIntegrityPath();
    if (!this.entries.some(e => e.filePath === integrityJson) && existsSync(integrityJson)) {
      const checksum = await ConfigIntegrity.computeChecksum(integrityJson);
      this.entries.push({
        filePath: integrityJson,
        checksum,
        lastVerified: Date.now(),
        algorithm: 'sha256',
        label: 'Config integrity database',
      });
      await this.save();
    }
  }

  /** Get the default config files to monitor */
  private getDefaultFiles(agentxDir: string): string[] {
    return [
      join(agentxDir, 'remotes.json'),
      join(agentxDir, 'agentx.db'),
      join(agentxDir, 'vault', 'audit.log'),
    ];
  }

  /** Guess a human-readable label for a tracked file */
  private guessLabel(filePath: string, agentxDir: string): string {
    const rel = relative(agentxDir, filePath);
    const labels: Record<string, string> = {
      'remotes.json': 'Remote server configurations',
      'agentx.db': 'Asset database (SQLite)',
      'vault/audit.log': 'Vault audit trail',
      'vault/integrity.json': 'Config integrity database',
    };
    return labels[rel] ?? basename(filePath);
  }

  /**
   * Verify all tracked files against their stored checksums.
   * Returns a result for each tracked file.
   */
  async verifyAll(): Promise<IntegrityResult[]> {
    await this.load();
    const results: IntegrityResult[] = [];

    for (let i = 0; i < this.entries.length; i++) {
      const result = await this.verifyEntry(this.entries[i]);
      // Update lastVerified on disk for 'ok' results
      if (result.status === 'ok') {
        this.entries[i].lastVerified = Date.now();
      }
      results.push(result);
    }

    await this.save();
    return results;
  }

  /** Verify a single entry */
  private async verifyEntry(entry: IntegrityEntry): Promise<IntegrityResult> {
    const base: Omit<IntegrityResult, 'status'> = {
      filePath: entry.filePath,
      expectedChecksum: entry.checksum,
      label: entry.label,
    };

    if (!existsSync(entry.filePath)) {
      return { ...base, status: 'missing' };
    }

    try {
      const actual = await ConfigIntegrity.computeChecksum(entry.filePath);
      if (actual === entry.checksum) {
        return { ...base, status: 'ok', actualChecksum: actual };
      }
      return { ...base, status: 'modified', actualChecksum: actual };
    } catch {
      return { ...base, status: 'missing' };
    }
  }

  /**
   * Update the stored checksum for a file (after a legitimate modification).
   * Throws if the file is not tracked.
   */
  async updateChecksum(filePath: string): Promise<void> {
    await this.load();
    const entry = this.entries.find(e => e.filePath === filePath);
    if (!entry) {
      throw new Error(`File is not tracked by integrity verification: ${filePath}`);
    }
    entry.checksum = await ConfigIntegrity.computeChecksum(filePath);
    entry.lastVerified = Date.now();
    await this.save();
  }

  /**
   * Check whether a specific file is tracked.
   */
  async isTracked(filePath: string): Promise<boolean> {
    await this.load();
    return this.entries.some(e => e.filePath === filePath);
  }

  /**
   * Get all tracked entries.
   */
  async getTrackedFiles(): Promise<IntegrityEntry[]> {
    await this.load();
    return [...this.entries];
  }

  /**
   * Scan the agentx directory for new config files that aren't yet tracked.
   * Returns the list of newly discovered files.
   */
  async scanForNewFiles(agentxDir?: string): Promise<string[]> {
    await this.load();
    const dir = agentxDir ?? getAgentxDir();
    const existingPaths = new Set(this.entries.map(e => e.filePath));
    const discovered: string[] = [];

    // Look for .json files in the agentx root
    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const fullPath = join(dir, file);
        if (!existingPaths.has(fullPath)) {
          discovered.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist — ignore
    }

    return discovered;
  }

  /**
   * Add a file to the tracking list.
   * Throws if the file does not exist or is already tracked.
   */
  async trackFile(filePath: string, label?: string): Promise<void> {
    await this.load();
    if (this.entries.some(e => e.filePath === filePath)) {
      throw new Error(`File is already tracked: ${filePath}`);
    }
    if (!existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const checksum = await ConfigIntegrity.computeChecksum(filePath);
    this.entries.push({
      filePath,
      checksum,
      lastVerified: Date.now(),
      algorithm: 'sha256',
      label,
    });
    await this.save();
  }

  /**
   * Remove a file from tracking.
   * Returns true if the file was tracked, false otherwise.
   */
  async removeFile(filePath: string): Promise<boolean> {
    await this.load();
    const idx = this.entries.findIndex(e => e.filePath === filePath);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    await this.save();
    return true;
  }

  /**
   * Count of tracked files.
   */
  get count(): number {
    return this.entries.length;
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private async load(): Promise<void> {
    const path = getIntegrityPath();
    if (!existsSync(path)) {
      this.entries = [];
      return;
    }
    try {
      const raw = await readFile(path, 'utf-8');
      const store = JSON.parse(raw) as IntegrityStore;
      this.entries = store.entries ?? [];
    } catch {
      // Corrupted integrity file — start fresh
      this.entries = [];
    }
  }

  private async save(): Promise<void> {
    const path = getIntegrityPath();
    const dir = dirname(path);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const store: IntegrityStore = {
      version: 1,
      entries: this.entries,
    };
    await writeFile(path, JSON.stringify(store, null, 2), 'utf-8');
  }
}
