import { LRUCache } from 'lru-cache';
import type { AssetMeta } from '../types.js';

// 配置 LRU 缓存选项
const cacheOptions = {
  max: 500, // 最大缓存条目数
  ttl: 1000 * 60 * 5, // 5分钟过期
  updateAgeOnGet: true, // 访问时更新过期时间
  allowStale: false,
};

// 创建缓存实例
const assetCache = new LRUCache<string, AssetMeta>(cacheOptions);
const contentCache = new LRUCache<string, string>(cacheOptions);
const listCache = new LRUCache<string, AssetMeta[]>({
  max: 100,
  ttl: 1000 * 60 * 2, // 2分钟过期
  updateAgeOnGet: true,
});

// 分页缓存
const paginatedCache = new LRUCache<string, {
  data: AssetMeta[];
  total: number;
  page: number;
  pageSize: number;
}>({
  max: 200,
  ttl: 1000 * 60 * 1, // 1分钟过期
  updateAgeOnGet: true,
});

// 性能监控
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

const stats: CacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  size: 0,
};

export function getAssetFromCache(id: string): AssetMeta | undefined {
  const cached = assetCache.get(id);
  if (cached) {
    stats.hits++;
    return cached;
  }
  stats.misses++;
  return undefined;
}

export function setAssetInCache(id: string, asset: AssetMeta): void {
  assetCache.set(id, asset);
  stats.size = assetCache.size;
}

export function deleteAssetFromCache(id: string): void {
  assetCache.delete(id);
  contentCache.delete(id);
  stats.size = assetCache.size;
}

export function clearAssetCache(): void {
  assetCache.clear();
  contentCache.clear();
  listCache.clear();
  paginatedCache.clear();
  stats.size = 0;
  stats.hits = 0;
  stats.misses = 0;
}

export function getContentFromCache(id: string): string | undefined {
  const cached = contentCache.get(id);
  if (cached) {
    stats.hits++;
    return cached;
  }
  stats.misses++;
  return undefined;
}

export function setContentInCache(id: string, content: string): void {
  contentCache.set(id, content);
}

export function getListFromCache(type?: string): AssetMeta[] | undefined {
  const key = type || 'all';
  const cached = listCache.get(key);
  if (cached) {
    stats.hits++;
    return cached;
  }
  stats.misses++;
  return undefined;
}

export function setListInCache(type: string | undefined, assets: AssetMeta[]): void {
  const key = type || 'all';
  listCache.set(key, assets);
}

export function getPaginatedFromCache(key: string): {
  data: AssetMeta[];
  total: number;
  page: number;
  pageSize: number;
} | undefined {
  const cached = paginatedCache.get(key);
  if (cached) {
    stats.hits++;
    return cached;
  }
  stats.misses++;
  return undefined;
}

export function setPaginatedInCache(
  key: string,
  data: AssetMeta[],
  total: number,
  page: number,
  pageSize: number
): void {
  paginatedCache.set(key, { data, total, page, pageSize });
}

export function invalidateListCache(): void {
  listCache.clear();
  paginatedCache.clear();
}

export function getCacheStats(): CacheStats & {
  assetCacheSize: number;
  contentCacheSize: number;
  listCacheSize: number;
  paginatedCacheSize: number;
  hitRate: number;
} {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    assetCacheSize: assetCache.size,
    contentCacheSize: contentCache.size,
    listCacheSize: listCache.size,
    paginatedCacheSize: paginatedCache.size,
    hitRate: total > 0 ? stats.hits / total : 0,
  };
}

export function updateCacheConfig(options: {
  max?: number;
  ttl?: number;
  maxList?: number;
  ttlList?: number;
}): void {
  if (options.max) {
    (assetCache as any).max = options.max;
  }
  if (options.ttl) {
    (assetCache as any).ttl = options.ttl;
  }
  if (options.maxList) {
    (listCache as any).max = options.maxList;
  }
  if (options.ttlList) {
    (listCache as any).ttl = options.ttlList;
  }
}
