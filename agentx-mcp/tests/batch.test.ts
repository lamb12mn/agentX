import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rm } from 'fs/promises';
import { initDb, closeDb } from '../src/store/db.js';
import {
  createAsset,
  getAsset,
  batchDeleteAssets,
  batchAddTags,
  batchRemoveTags,
  createDependency,
  getDependencies,
  getDependents,
  detectCircularDependencies,
} from '../src/store/assets.js';

const testBaseDir = join(tmpdir(), `agentx-batch-test-${Date.now()}`);
const testDbPath = join(testBaseDir, 'test.db');

describe('batch operations', () => {
  beforeEach(() => {
    initDb(testDbPath);
  });

  afterEach(async () => {
    closeDb();
    await rm(testBaseDir, { recursive: true, force: true });
  });

  describe('batchDeleteAssets', () => {
    it('deletes multiple assets successfully', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: [] }, 'content1', testBaseDir);
      const a2 = await createAsset({ type: 'skill', name: 'skill2', tags: [] }, 'content2', testBaseDir);
      const a3 = await createAsset({ type: 'prompt', name: 'prompt1', tags: [] }, 'content3', testBaseDir);

      const result = await batchDeleteAssets([a1.id, a2.id, a3.id]);

      expect(result.deleted).toHaveLength(3);
      expect(result.deleted).toContain(a1.id);
      expect(result.deleted).toContain(a2.id);
      expect(result.deleted).toContain(a3.id);
      expect(result.blocked).toHaveLength(0);
      expect(result.errors).toHaveLength(0);

      // 验证已删除
      expect(await getAsset(a1.id)).toBeNull();
      expect(await getAsset(a2.id)).toBeNull();
      expect(await getAsset(a3.id)).toBeNull();
    });

    it('handles non-existent IDs gracefully', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: [] }, 'content1', testBaseDir);

      const result = await batchDeleteAssets([a1.id, 'non-existent-id']);

      expect(result.deleted).toHaveLength(1);
      expect(result.deleted).toContain(a1.id);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].id).toBe('non-existent-id');
    });

    it('blocks deletion of assets that are dependencies of others', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: [] }, 'content1', testBaseDir);
      const a2 = await createAsset({ type: 'skill', name: 'skill2', tags: [] }, 'content2', testBaseDir);

      // a2 依赖 a1
      createDependency(a2.id, a1.id);

      const result = await batchDeleteAssets([a1.id]);

      expect(result.deleted).toHaveLength(0);
      expect(result.blocked).toHaveLength(1);
      expect(result.blocked).toContain(a1.id);
    });

    it('force deletes even when dependencies exist', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: [] }, 'content1', testBaseDir);
      const a2 = await createAsset({ type: 'skill', name: 'skill2', tags: [] }, 'content2', testBaseDir);

      createDependency(a2.id, a1.id);

      const result = await batchDeleteAssets([a1.id], { force: true });

      expect(result.deleted).toHaveLength(1);
      expect(result.deleted).toContain(a1.id);
      expect(result.blocked).toHaveLength(0);

      // a2 仍然存在但依赖关系已删除
      expect(await getAsset(a2.id)).not.toBeNull();
    });

    it('dryRun mode does not actually delete', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: [] }, 'content1', testBaseDir);

      const result = await batchDeleteAssets([a1.id], { dryRun: true });

      expect(result.deleted).toHaveLength(1);
      expect(result.deleted).toContain(a1.id);
      expect(await getAsset(a1.id)).not.toBeNull(); // 仍然存在
    });

    it('handles empty ID list', async () => {
      const result = await batchDeleteAssets([]);
      expect(result.deleted).toHaveLength(0);
      expect(result.blocked).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('batchAddTags', () => {
    it('adds tags to multiple assets', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: ['tag1'] }, 'content1', testBaseDir);
      const a2 = await createAsset({ type: 'skill', name: 'skill2', tags: [] }, 'content2', testBaseDir);

      const result = await batchAddTags([a1.id, a2.id], ['new-tag', 'another']);

      expect(result.updated).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      const updated1 = await getAsset(a1.id);
      const updated2 = await getAsset(a2.id);

      expect(updated1!.tags).toContain('new-tag');
      expect(updated1!.tags).toContain('another');
      expect(updated1!.tags).toContain('tag1'); // 保留原有标签

      expect(updated2!.tags).toContain('new-tag');
      expect(updated2!.tags).toContain('another');
    });

    it('deduplicates tags', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: ['tag1'] }, 'content1', testBaseDir);

      const result = await batchAddTags([a1.id], ['tag1', 'tag1', 'new-tag']);

      expect(result.updated).toHaveLength(1);
      const updated = await getAsset(a1.id);
      expect(updated!.tags).toEqual(['tag1', 'new-tag']);
    });

    it('handles non-existent assets', async () => {
      const result = await batchAddTags(['non-existent'], ['tag']);

      expect(result.updated).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Asset not found');
    });
  });

  describe('batchRemoveTags', () => {
    it('removes tags from multiple assets', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: ['tag1', 'tag2', 'tag3'] }, 'content1', testBaseDir);
      const a2 = await createAsset({ type: 'skill', name: 'skill2', tags: ['tag1', 'tag2'] }, 'content2', testBaseDir);

      const result = await batchRemoveTags([a1.id, a2.id], ['tag1']);

      expect(result.updated).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      const updated1 = await getAsset(a1.id);
      const updated2 = await getAsset(a2.id);

      expect(updated1!.tags).not.toContain('tag1');
      expect(updated1!.tags).toContain('tag2');
      expect(updated1!.tags).toContain('tag3');

      expect(updated2!.tags).not.toContain('tag1');
      expect(updated2!.tags).toContain('tag2');
    });

    it('removes multiple tags', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: ['a', 'b', 'c', 'd'] }, 'content1', testBaseDir);

      const result = await batchRemoveTags([a1.id], ['a', 'c']);

      const updated = await getAsset(a1.id);
      expect(updated!.tags).toEqual(['b', 'd']);
    });

    it('handles removing non-existent tags', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: ['tag1'] }, 'content1', testBaseDir);

      const result = await batchRemoveTags([a1.id], ['non-existent']);

      expect(result.updated).toHaveLength(1);
      const updated = await getAsset(a1.id);
      expect(updated!.tags).toEqual(['tag1']); // 无变化
    });
  });

  describe('dependency management', () => {
    it('createDependency creates dependency relationship', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: [] }, 'content1', testBaseDir);
      const a2 = await createAsset({ type: 'skill', name: 'skill2', tags: [] }, 'content2', testBaseDir);

      createDependency(a2.id, a1.id);

      const deps = getDependencies(a2.id);
      expect(deps).toContain(a1.id);
    });

    it('getDependents returns assets that depend on given asset', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: [] }, 'content1', testBaseDir);
      const a2 = await createAsset({ type: 'skill', name: 'skill2', tags: [] }, 'content2', testBaseDir);
      const a3 = await createAsset({ type: 'skill', name: 'skill3', tags: [] }, 'content3', testBaseDir);

      createDependency(a2.id, a1.id);
      createDependency(a3.id, a1.id);

      const dependents = getDependents(a1.id);
      expect(dependents).toHaveLength(2);
      expect(dependents).toContain(a2.id);
      expect(dependents).toContain(a3.id);
    });

    it('isAssetUsed correctly identifies used assets', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: [] }, 'content1', testBaseDir);
      const a2 = await createAsset({ type: 'skill', name: 'skill2', tags: [] }, 'content2', testBaseDir);

      // 需要重新获取或直接调用函数

      createDependency(a2.id, a1.id);

      // 需要重新获取或直接调用函数
      const { isAssetUsed } = await import('../src/store/assets.js');
      expect(isAssetUsed(a1.id)).toBe(true);
      expect(isAssetUsed(a2.id)).toBe(false);
    });
  });

  describe('detectCircularDependencies', () => {
    it('detects simple circular dependency', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: [] }, 'content1', testBaseDir);
      const a2 = await createAsset({ type: 'skill', name: 'skill2', tags: [] }, 'content2', testBaseDir);

      // a1 -> a2 -> a1 (circular)
      createDependency(a1.id, a2.id);
      createDependency(a2.id, a1.id);

      const cycle = detectCircularDependencies(a1.id);
      expect(cycle.length).toBeGreaterThan(0);
      expect(cycle).toContain(a1.id);
      expect(cycle).toContain(a2.id);
    });

    it('returns empty array for no circular dependency', async () => {
      const a1 = await createAsset({ type: 'skill', name: 'skill1', tags: [] }, 'content1', testBaseDir);
      const a2 = await createAsset({ type: 'skill', name: 'skill2', tags: [] }, 'content2', testBaseDir);

      createDependency(a1.id, a2.id);

      const cycle = detectCircularDependencies(a1.id);
      expect(cycle).toHaveLength(0);
    });
  });
});
