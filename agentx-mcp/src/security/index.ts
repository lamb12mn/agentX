/**
 * Security module exports
 *
 * Phase 1: Credential Vault (AES-256-GCM file encryption)
 * Phase 2: OS keychain integration (keytar) — ✅ Complete (optional, installed via postinstall)
 * Phase 3: Config integrity (SHA-256 checksums)
 * Phase 4: MCP sandbox (resource-limited child process)
 */

export { CredentialVault } from './vault.js';
export { ConfigIntegrity } from './integrity.js';
export { McpSandbox } from './sandbox.js';
export type { VaultEntry, VaultAuditAction, VaultAuditEntry, KeychainBackend } from './vault.js';
export type { IntegrityEntry, IntegrityResult } from './integrity.js';
export type { SandboxOptions, SandboxResult } from './sandbox.js';
