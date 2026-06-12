import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/store/db';
import { createAsset } from '../../src/store/assets';
import { searchAssets } from '../../src/store/search';

describe('search module', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-search-test-'));
    initDb(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty results for empty query', async () => {
    const results = await searchAssets('');
    expect(results).toEqual([]);
  });

  it('returns empty results for whitespace-only query', async () => {
    const results = await searchAssets('   ');
    expect(results).toEqual([]);
  });

  it('returns empty results when no assets match', async () => {
    const results = await searchAssets('nonexistent');
    expect(results).toEqual([]);
  });

  it('finds assets by name keyword', async () => {
    await createAsset(
      { type: 'skill', name: 'hello-world', tags: ['test'], description: 'A test skill' },
      '# Hello World\nTest content',
      tmpDir
    );

    const results = await searchAssets('hello');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].meta.name).toBe('hello-world');
  });

  it('returns cached results for repeated same query', async () => {
    await createAsset(
      { type: 'skill', name: 'cache-test', tags: [], description: 'For caching' },
      'cache test content',
      tmpDir
    );

    // First call populates cache
    const first = await searchAssets('cache');
    expect(first.length).toBeGreaterThanOrEqual(1);

    // Second call should return from cache (same results)
    const second = await searchAssets('cache');
    expect(second).toEqual(first);
  });

  it('returns empty results for FTS5-invalid query', async () => {
    // Nested parentheses can cause FTS5 errors
    const results = await searchAssets('(((');
    expect(results).toEqual([]);
  });
});
