import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rm, readFile } from 'fs/promises';
import { initDb, closeDb } from './db.js';
import {
  createAsset,
  getAsset,
  updateAsset,
  deleteAsset,
  listAssets,
  readAssetContent,
} from './assets.js';

// Each test run gets its own isolated directory
const testBaseDir = join(tmpdir(), `agentx-test-${Date.now()}`);
const testDbPath = join(testBaseDir, 'test.db');

describe('assets store', () => {
  beforeEach(() => {
    // initDb creates the directory via mkdirSync internally
    initDb(testDbPath);
  });

  afterEach(async () => {
    closeDb();
    await rm(testBaseDir, { recursive: true, force: true });
  });

  // ── createAsset ──────────────────────────────────────────────────────────

  it('createAsset returns correct metadata', async () => {
    const meta = await createAsset(
      { type: 'prompt', name: 'hello', tags: ['a', 'b'], description: 'desc' },
      'Hello world',
      testBaseDir,
    );

    expect(meta.id).toBeTruthy();
    expect(meta.type).toBe('prompt');
    expect(meta.name).toBe('hello');
    expect(meta.description).toBe('desc');
    expect(meta.tags).toEqual(['a', 'b']);
    expect(meta.file_path).toContain('hello.md');
    expect(meta.created_at).toBeTruthy();
    expect(meta.updated_at).toBeTruthy();
  });

  it('createAsset writes content to disk', async () => {
    const content = '# My Prompt\nSome content here.';
    const meta = await createAsset(
      { type: 'prompt', name: 'disk-test', tags: [] },
      content,
      testBaseDir,
    );

    const onDisk = await readFile(meta.file_path, 'utf-8');
    expect(onDisk).toBe(content);
  });

  it('createAsset uses .yaml extension for mcp type', async () => {
    const meta = await createAsset(
      { type: 'mcp', name: 'my-mcp', tags: [] },
      'yaml: content',
      testBaseDir,
    );
    expect(meta.file_path).toMatch(/\.yaml$/);
  });

  it('createAsset uses .yaml extension for workflow type', async () => {
    const meta = await createAsset(
      { type: 'workflow', name: 'my-workflow', tags: [] },
      'steps: []',
      testBaseDir,
    );
    expect(meta.file_path).toMatch(/\.yaml$/);
  });

  it('createAsset uses .yaml extension for agent type', async () => {
    const meta = await createAsset(
      { type: 'agent', name: 'my-agent', tags: [] },
      'agent: config',
      testBaseDir,
    );
    expect(meta.file_path).toMatch(/\.yaml$/);
  });

  it('createAsset uses .md extension for prompt type', async () => {
    const meta = await createAsset(
      { type: 'prompt', name: 'my-prompt', tags: [] },
      '# prompt',
      testBaseDir,
    );
    expect(meta.file_path).toMatch(/\.md$/);
  });

  // ── getAsset ─────────────────────────────────────────────────────────────

  it('getAsset returns null for non-existent id', async () => {
    const result = await getAsset('non-existent-id');
    expect(result).toBeNull();
  });

  it('getAsset returns the asset after creation', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'get-test', tags: ['x'] },
      'content',
      testBaseDir,
    );

    const fetched = await getAsset(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe('get-test');
    expect(fetched!.tags).toEqual(['x']);
  });

  // ── listAssets ───────────────────────────────────────────────────────────

  it('listAssets returns all assets when no type filter', async () => {
    await createAsset({ type: 'prompt', name: 'p1', tags: [] }, 'c1', testBaseDir);
    await createAsset({ type: 'mcp', name: 'm1', tags: [] }, 'c2', testBaseDir);

    const all = await listAssets();
    expect(all.length).toBe(2);
  });

  it('listAssets filters by type correctly', async () => {
    await createAsset({ type: 'prompt', name: 'p1', tags: [] }, 'c1', testBaseDir);
    await createAsset({ type: 'prompt', name: 'p2', tags: [] }, 'c2', testBaseDir);
    await createAsset({ type: 'mcp', name: 'm1', tags: [] }, 'c3', testBaseDir);

    const prompts = await listAssets('prompt');
    expect(prompts.length).toBe(2);
    expect(prompts.every((a) => a.type === 'prompt')).toBe(true);

    const mcps = await listAssets('mcp');
    expect(mcps.length).toBe(1);
    expect(mcps[0].type).toBe('mcp');
  });

  it('listAssets returns empty array when no assets exist', async () => {
    const all = await listAssets();
    expect(all).toEqual([]);
  });

  // ── updateAsset ──────────────────────────────────────────────────────────

  it('updateAsset updates metadata fields', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'update-me', tags: ['old'], description: 'old desc' },
      'original content',
      testBaseDir,
    );

    const updated = await updateAsset(created.id, {
      name: 'updated-name',
      description: 'new desc',
      tags: ['new', 'tags'],
    });

    expect(updated.name).toBe('updated-name');
    expect(updated.description).toBe('new desc');
    expect(updated.tags).toEqual(['new', 'tags']);
  });

  it('updateAsset with content updates the file on disk', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'content-update', tags: [] },
      'original content',
      testBaseDir,
    );

    await updateAsset(created.id, { content: 'updated content' });

    const onDisk = await readFile(created.file_path, 'utf-8');
    expect(onDisk).toBe('updated content');
  });

  it('updateAsset without content does NOT change file content', async () => {
    const originalContent = 'do not change me';
    const created = await createAsset(
      { type: 'prompt', name: 'no-content-update', tags: [] },
      originalContent,
      testBaseDir,
    );

    await updateAsset(created.id, { name: 'renamed' });

    const onDisk = await readFile(created.file_path, 'utf-8');
    expect(onDisk).toBe(originalContent);
  });

  it('updateAsset throws for non-existent id', async () => {
    await expect(updateAsset('bad-id', { name: 'x' })).rejects.toThrow('Asset not found: bad-id');
  });

  it('updateAsset updates updated_at timestamp', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'ts-test', tags: [] },
      'content',
      testBaseDir,
    );

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 10));

    const updated = await updateAsset(created.id, { name: 'ts-test-renamed' });
    // updated_at should be >= created_at (both are ISO strings)
    expect(updated.updated_at >= created.updated_at).toBe(true);
  });

  // ── deleteAsset ──────────────────────────────────────────────────────────

  it('deleteAsset removes the DB record', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'delete-me', tags: [] },
      'bye',
      testBaseDir,
    );

    await deleteAsset(created.id);

    const fetched = await getAsset(created.id);
    expect(fetched).toBeNull();
  });

  it('deleteAsset removes the file from disk', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'delete-file', tags: [] },
      'bye',
      testBaseDir,
    );
    const filePath = created.file_path;

    await deleteAsset(created.id);

    await expect(readFile(filePath, 'utf-8')).rejects.toThrow();
  });

  it('deleteAsset is a no-op for non-existent id', async () => {
    // Should not throw
    await expect(deleteAsset('non-existent')).resolves.toBeUndefined();
  });

  // ── readAssetContent ─────────────────────────────────────────────────────

  it('readAssetContent returns the file content', async () => {
    const content = '# Hello\nThis is content.';
    const created = await createAsset(
      { type: 'prompt', name: 'read-content', tags: [] },
      content,
      testBaseDir,
    );

    const read = await readAssetContent(created.id);
    expect(read).toBe(content);
  });

  it('readAssetContent reflects updated content after updateAsset', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'read-updated', tags: [] },
      'original',
      testBaseDir,
    );

    await updateAsset(created.id, { content: 'updated' });

    const read = await readAssetContent(created.id);
    expect(read).toBe('updated');
  });

  it('readAssetContent throws for non-existent id', async () => {
    await expect(readAssetContent('bad-id')).rejects.toThrow('Asset not found: bad-id');
  });
});
