import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigIntegrity } from '../../src/security/integrity.js';

describe('ConfigIntegrity', () => {
  let tmpDir: string;
  let agentxDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-integrity-test-'));
    agentxDir = join(tmpDir, '.agentx');
    mkdirSync(agentxDir, { recursive: true });
    // Point AGENTX_DIR to our temp dir
    process.env.AGENTX_DIR = agentxDir;
  });

  afterEach(() => {
    delete process.env.AGENTX_DIR;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── computeChecksum ─────────────────────────────────────────────────────

  it('computeChecksum returns consistent SHA-256 for same file', async () => {
    const filePath = join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'hello world', 'utf-8');

    const hash1 = await ConfigIntegrity.computeChecksum(filePath);
    const hash2 = await ConfigIntegrity.computeChecksum(filePath);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex is 64 chars
  });

  it('computeChecksum returns different hash for different content', async () => {
    const fileA = join(tmpDir, 'a.txt');
    const fileB = join(tmpDir, 'b.txt');
    writeFileSync(fileA, 'content one', 'utf-8');
    writeFileSync(fileB, 'content two', 'utf-8');

    const hashA = await ConfigIntegrity.computeChecksum(fileA);
    const hashB = await ConfigIntegrity.computeChecksum(fileB);
    expect(hashA).not.toBe(hashB);
  });

  it('computeChecksum throws for nonexistent file', async () => {
    await expect(
      ConfigIntegrity.computeChecksum(join(tmpDir, 'nonexistent.txt')),
    ).rejects.toThrow();
  });

  // ── initialize ───────────────────────────────────────────────────────────

  it('initialize creates integrity.json with default files', async () => {
    // Create some default files
    writeFileSync(join(agentxDir, 'remotes.json'), JSON.stringify([{ name: 'test', url: 'http://test' }]));
    writeFileSync(join(agentxDir, 'agentx.db'), Buffer.alloc(100));

    const ci = new ConfigIntegrity();
    await ci.initialize();

    const files = await ci.getTrackedFiles();
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files.some(f => f.filePath.endsWith('remotes.json'))).toBe(true);
    expect(files.some(f => f.filePath.endsWith('agentx.db'))).toBe(true);
  });

  it('initialize is idempotent', async () => {
    writeFileSync(join(agentxDir, 'remotes.json'), '[]');
    const ci = new ConfigIntegrity();

    await ci.initialize();
    const count1 = ci.count;

    await ci.initialize();
    const count2 = ci.count;

    expect(count2).toBe(count1);
  });

  // ── verifyAll ────────────────────────────────────────────────────────────

  it('verifyAll returns ok for unmodified files', async () => {
    writeFileSync(join(agentxDir, 'remotes.json'), JSON.stringify([{ name: 'test', url: 'http://test' }]));
    writeFileSync(join(agentxDir, 'agentx.db'), Buffer.alloc(100));

    const ci = new ConfigIntegrity();
    await ci.initialize();

    const results = await ci.verifyAll();
    for (const r of results) {
      expect(r.status).toBe('ok');
    }
  });

  it('verifyAll detects modified files', async () => {
    const remotesPath = join(agentxDir, 'remotes.json');
    writeFileSync(remotesPath, JSON.stringify([{ name: 'original', url: 'http://original' }]));

    const ci = new ConfigIntegrity();
    await ci.initialize();

    // Modify the file after initialization
    writeFileSync(remotesPath, JSON.stringify([{ name: 'hacked', url: 'http://evil' }]));

    const results = await ci.verifyAll();
    const remotesResult = results.find(r => r.filePath.endsWith('remotes.json'));
    expect(remotesResult).toBeDefined();
    expect(remotesResult!.status).toBe('modified');
    expect(remotesResult!.expectedChecksum).toBeDefined();
    expect(remotesResult!.actualChecksum).toBeDefined();
    expect(remotesResult!.expectedChecksum).not.toBe(remotesResult!.actualChecksum);
  });

  it('verifyAll reports missing files', async () => {
    const ci = new ConfigIntegrity();
    await ci.initialize();

    const results = await ci.verifyAll();
    // All default files don't exist — should all be 'missing'
    for (const r of results) {
      expect(r.status).toBe('missing');
    }
  });

  it('verifyAll reports new files after scan', async () => {
    // Don't create remotes.json initially
    writeFileSync(join(agentxDir, 'agentx.db'), Buffer.alloc(100));

    const ci = new ConfigIntegrity();
    await ci.initialize();

    // Create a new file after init
    writeFileSync(join(agentxDir, 'remotes.json'), '[]');

    // Scan for new files
    const discovered = await ci.scanForNewFiles();
    expect(discovered.length).toBeGreaterThanOrEqual(1);
    expect(discovered.some(f => f.endsWith('remotes.json'))).toBe(true);
  });

  // ── updateChecksum ──────────────────────────────────────────────────────

  it('updateChecksum updates stored checksum after legitimate modification', async () => {
    const remotesPath = join(agentxDir, 'remotes.json');
    writeFileSync(remotesPath, JSON.stringify([{ name: 'v1', url: 'http://v1' }]));

    const ci = new ConfigIntegrity();
    await ci.initialize();

    // Modify legitimately
    writeFileSync(remotesPath, JSON.stringify([{ name: 'v2', url: 'http://v2' }]));
    await ci.updateChecksum(remotesPath);

    const results = await ci.verifyAll();
    const remotesResult = results.find(r => r.filePath.endsWith('remotes.json'));
    expect(remotesResult!.status).toBe('ok');
  });

  it('updateChecksum throws for untracked file', async () => {
    const ci = new ConfigIntegrity();
    await ci.initialize();

    await expect(
      ci.updateChecksum(join(tmpDir, 'untracked.txt')),
    ).rejects.toThrow('not tracked');
  });

  // ── trackFile / removeFile ───────────────────────────────────────────────

  it('trackFile adds a file to tracking', async () => {
    const customFile = join(tmpDir, 'custom-config.json');
    writeFileSync(customFile, JSON.stringify({ key: 'value' }));

    const ci = new ConfigIntegrity();
    await ci.initialize();
    await ci.trackFile(customFile, 'Custom config');

    const tracked = await ci.getTrackedFiles();
    expect(tracked.some(f => f.filePath === customFile)).toBe(true);
    expect(tracked.find(f => f.filePath === customFile)!.label).toBe('Custom config');

    // Verify it
    const results = await ci.verifyAll();
    const customResult = results.find(r => r.filePath === customFile);
    expect(customResult!.status).toBe('ok');
  });

  it('trackFile throws for nonexistent file', async () => {
    const ci = new ConfigIntegrity();
    await ci.initialize();

    await expect(
      ci.trackFile(join(tmpDir, 'nonexistent.json')),
    ).rejects.toThrow('does not exist');
  });

  it('trackFile throws for already tracked file', async () => {
    const customFile = join(tmpDir, 'custom.json');
    writeFileSync(customFile, '{}');

    const ci = new ConfigIntegrity();
    await ci.initialize();
    await ci.trackFile(customFile);
    await expect(ci.trackFile(customFile)).rejects.toThrow('already tracked');
  });

  it('removeFile stops tracking a file', async () => {
    const customFile = join(tmpDir, 'to-remove.json');
    writeFileSync(customFile, '{}');

    const ci = new ConfigIntegrity();
    await ci.initialize();
    await ci.trackFile(customFile);
    expect(await ci.isTracked(customFile)).toBe(true);

    const removed = await ci.removeFile(customFile);
    expect(removed).toBe(true);
    expect(await ci.isTracked(customFile)).toBe(false);
  });

  it('removeFile returns false for untracked file', async () => {
    const ci = new ConfigIntegrity();
    await ci.initialize();
    const removed = await ci.removeFile(join(tmpDir, 'not-tracked.json'));
    expect(removed).toBe(false);
  });

  // ── edge cases ───────────────────────────────────────────────────────────

  it('persists integrity data across instances', async () => {
    writeFileSync(join(agentxDir, 'remotes.json'), '{}');

    const ci1 = new ConfigIntegrity();
    await ci1.initialize();
    expect(ci1.count).toBeGreaterThanOrEqual(1);

    // Create a new instance pointing to same dir
    const ci2 = new ConfigIntegrity();
    await ci2.initialize();
    expect(ci2.count).toBe(ci1.count);
  });

  it('handles empty agentx directory gracefully', async () => {
    const ci = new ConfigIntegrity();
    await ci.initialize();
    expect(ci.count).toBe(0);
  });

  it('handles binary files correctly', async () => {
    const binFile = join(tmpDir, 'binary.bin');
    writeFileSync(binFile, Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE]));

    const hash = await ConfigIntegrity.computeChecksum(binFile);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
