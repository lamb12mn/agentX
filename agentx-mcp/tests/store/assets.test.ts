import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/store/db';
import {
  createAsset,
  getAsset,
  listAssets,
  updateAsset,
  deleteAsset,
  readAssetContent,
} from '../../src/store/assets';

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

  it('creates an asset and returns its metadata', async () => {
    const meta = await createAsset(
      { type: 'skill', name: 'test-skill', tags: [], description: 'A test skill' },
      '# Test Skill\nThis is a test.',
      tmpDir
    );
    expect(meta.id).toBeTruthy();
    expect(meta.name).toBe('test-skill');
    expect(meta.type).toBe('skill');
    expect(meta.file_path).toContain('test-skill');
  });

  it('gets an asset by id', async () => {
    const created = await createAsset(
      { type: 'prompt', name: 'my-prompt', tags: ['ai'] },
      'You are a helpful assistant.',
      tmpDir
    );
    const fetched = await getAsset(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.tags).toEqual(['ai']);
  });

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

  it('updates asset metadata', async () => {
    const created = await createAsset(
      { type: 'skill', name: 'old-name', tags: [] },
      'content',
      tmpDir
    );
    const updated = await updateAsset(created.id, { name: 'new-name', tags: ['updated'] });
    expect(updated.name).toBe('new-name');
    expect(updated.tags).toEqual(['updated']);
  });

  it('deletes an asset', async () => {
    const created = await createAsset(
      { type: 'skill', name: 'to-delete', tags: [] },
      'content',
      tmpDir
    );
    await deleteAsset(created.id);
    const fetched = await getAsset(created.id);
    expect(fetched).toBeNull();
  });

  it('reads asset file content', async () => {
    const content = '# My Skill\nDo something useful.';
    const created = await createAsset(
      { type: 'skill', name: 'readable', tags: [] },
      content,
      tmpDir
    );
    const read = await readAssetContent(created.id);
    expect(read).toBe(content);
  });
});
