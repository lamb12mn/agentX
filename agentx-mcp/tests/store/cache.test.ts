import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAssetCache,
  setContentInCache,
  getContentFromCache,
  setListInCache,
  getListFromCache,
  invalidateListCache,
  getCacheStats,
  updateCacheConfig,
} from '../../src/store/cache.js';

describe('asset cache', () => {
  beforeEach(() => {
    clearAssetCache();
  });

  it('tracks hits, misses and hit rate', () => {
    setContentInCache('a', 'content-a');

    expect(getContentFromCache('a')).toBe('content-a');
    expect(getContentFromCache('missing')).toBeUndefined();

    const stats = getCacheStats();
    expect(stats).toMatchObject({ hits: 1, misses: 1, hitRate: 0.5 });
    expect(stats).toHaveProperty('assetCacheSize');
    expect(stats).toHaveProperty('contentCacheSize');
    expect(stats).toHaveProperty('listCacheSize');
    expect(stats).toHaveProperty('paginatedCacheSize');
  });

  it('invalidates list caches without dropping content', () => {
    setListInCache('skill', []);
    setContentInCache('a', 'content-a');

    invalidateListCache();

    expect(getListFromCache('skill')).toBeUndefined();
    expect(getContentFromCache('a')).toBe('content-a');
  });

  it('applies runtime list capacity overrides', () => {
    updateCacheConfig({ maxList: 1 });
    setListInCache('a', []);
    setListInCache('b', []);

    expect(getCacheStats().listCacheSize).toBe(1);

    updateCacheConfig({ maxList: 100 });
  });
});
