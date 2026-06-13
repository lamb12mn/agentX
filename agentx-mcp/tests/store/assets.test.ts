import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/store/db.js';
import {
  createAsset,
  getAsset,
  listAssets,
  updateAsset,
  deleteAsset,
  readAssetContent,
} from '../../src/store/assets.js';

describe('assets store', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-assets-test-'));
    initDb(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── createAsset ──────────────────────────────────────────────────────────

  it('creates an asset and returns its metadata', async () => {
    const meta = await createAsset(
      { type: 'skill', name: 'test-skill', tags: [], description: 'A test skill' },
      '# Test Skill\nThis is a test.',
      tmpDir,
    );
    expect(meta.id).toBeTruthy();
    expect(meta.name).toBe('test-skill');
    expect(meta.type).toBe('skill');
    expect(meta.description).toBe('A test skill');
    expect(meta.tags).toEqual([]);
    expect(meta.file_path).toContain('test-skill');
    expect(meta.created_at).toBeTruthy();
    expect(meta.updated_at).toBeTruthy();
  });

  it('createAsset writes content to disk', async () => {
    const content = '# My Prompt\nSome content here.';
    const meta = await createAsset(
      { type: 'prompt', name: 'disk-test', tags: [] },
      content,
      tmpDir,
    );
    const onDisk = readFileSync(meta.file_path, 'utf-8');
    expect(onDisk).toBe(content);
  });

  it('createAsset uses .yaml extension for mcp type', async () => {
    const meta = await createAsset(
      { type: 'mcp', name: 'my-mcp', tags: [] },
      'yaml: content',
      tmpDir,
    );
    expect(meta.file_path).toMatch(/\.yaml$/);
  });

  it('createAsset uses .yaml extension for workflow type', async () => {
    const meta = await createAsset(
      { type: 'workflow', name: 'my-workflow', tags: [] },
      'steps: []',
      tmpDir,
    );
    expect(meta.file_path).toMatch(/\.yaml$/);
  });

  it('createAsset uses .yaml extension for agent type', async () => {
    const meta = await createAsset(
      { type: 'agent', name: 'my-agent', tags: [] },
      'agent: config',
      tmpDir,
    );
    expect(meta.file_path).toMatch(/\.yaml$/);
  });

  it('createAsset uses .md extension for prompt type', async () => {
    const meta = await createAsset(
      { type: 'prompt', name: 'my-prompt', tags: [] },
      '# prompt',
      tmpDir,
    );
    expect(meta.file_path).toMatch(/\.md$/);
  });

  // ── getAsset ─────────────────────────────────────────────────────────────

  it('gets an asset by id', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'my-prompt', tags: ['ai'] },
      'You are a helpful assistant.',
      tmpDir,
    );
    const fetched = await getAsset(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.tags).toEqual(['ai']);
  });

  it('getAsset returns null for non-existent id', async () => {
    const result = await getAsset('non-existent-id');
    expect(result).toBeNull();
  });

  // ── listAssets ───────────────────────────────────────────────────────────

  it('lists assets by type', async () => {
    await createAsset({ type: 'skill', name: 'skill-a', tags: [] }, 'content a', tmpDir);
    await createAsset({ type: 'skill', name: 'skill-b', tags: [] }, 'content b', tmpDir);
    await createAsset({ type: 'rule', name: 'rule-a', tags: [] }, 'rule content', tmpDir);

    const skills = await listAssets('skill');
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name)).toContain('skill-a');
    expect(skills.map((s) => s.name)).toContain('skill-b');
  });

  it('lists all assets when no type filter', async () => {
    await createAsset({ type: 'skill', name: 'skill-a', tags: [] }, 'content', tmpDir);
    await createAsset({ type: 'rule', name: 'rule-a', tags: [] }, 'content', tmpDir);
    const all = await listAssets();
    expect(all).toHaveLength(2);
  });

  it('listAssets returns empty array when no assets exist', async () => {
    const all = await listAssets();
    expect(all).toEqual([]);
  });

  // ── updateAsset ──────────────────────────────────────────────────────────

  it('updates asset metadata', async () => {
    const created = await createAsset(
      { type: 'skill', name: 'old-name', tags: [] },
      'content',
      tmpDir,
    );
    const updated = await updateAsset(created.id, { name: 'new-name', tags: ['updated'] });
    expect(updated.name).toBe('new-name');
    expect(updated.tags).toEqual(['updated']);
  });

  it('updateAsset with content updates the file on disk', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'content-update', tags: [] },
      'original content',
      tmpDir,
    );
    await updateAsset(created.id, { content: 'updated content' });
    const onDisk = readFileSync(created.file_path, 'utf-8');
    expect(onDisk).toBe('updated content');
  });

  it('updateAsset without content does NOT change file content', async () => {
    const originalContent = 'do not change me';
    const created = await createAsset(
      { type: 'prompt', name: 'no-content-update', tags: [] },
      originalContent,
      tmpDir,
    );
    await updateAsset(created.id, { name: 'renamed' });
    const onDisk = readFileSync(created.file_path, 'utf-8');
    expect(onDisk).toBe(originalContent);
  });

  it('updateAsset throws for non-existent id', async () => {
    await expect(updateAsset('bad-id', { name: 'x' })).rejects.toThrow('Asset not found: bad-id');
  });

  it('updateAsset updates updated_at timestamp', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'ts-test', tags: [] },
      'content',
      tmpDir,
    );
    await new Promise((r) => setTimeout(r, 10));
    const updated = await updateAsset(created.id, { name: 'ts-test-renamed' });
    expect(updated.updated_at).toBeGreaterThanOrEqual(created.updated_at);
  });

  // ── deleteAsset ──────────────────────────────────────────────────────────

  it('deletes an asset', async () => {
    const created = await createAsset(
      { type: 'skill', name: 'to-delete', tags: [] },
      'content',
      tmpDir,
    );
    await deleteAsset(created.id);
    const fetched = await getAsset(created.id);
    expect(fetched).toBeNull();
  });

  it('deleteAsset removes the file from disk', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'delete-file', tags: [] },
      'bye',
      tmpDir,
    );
    const filePath = created.file_path;
    await deleteAsset(created.id);
    expect(() => readFileSync(filePath, 'utf-8')).toThrow();
  });

  it('deleteAsset is a no-op for non-existent id', async () => {
    await expect(deleteAsset('non-existent')).resolves.toBeUndefined();
  });

  // ── readAssetContent ─────────────────────────────────────────────────────

  it('reads asset file content', async () => {
    const content = '# My Skill\nDo something useful.';
    const created = await createAsset(
      { type: 'skill', name: 'readable', tags: [] },
      content,
      tmpDir,
    );
    const read = await readAssetContent(created.id);
    expect(read).toBe(content);
  });

  it('readAssetContent reflects updated content after updateAsset', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'read-updated', tags: [] },
      'original',
      tmpDir,
    );
    await updateAsset(created.id, { content: 'updated' });
    const read = await readAssetContent(created.id);
    expect(read).toBe('updated');
  });

  it('readAssetContent throws for non-existent id', async () => {
    await expect(readAssetContent('bad-id')).rejects.toThrow('Asset not found: bad-id');
  });
});
