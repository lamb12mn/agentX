import { getDb } from './db.js';
import type { AssetMeta, AssetType, SearchResult } from '../types.js';
import { LRUCache } from 'lru-cache';

export type { SearchResult };

/**
 * 搜索缓存：相同查询 30 秒内直接返回缓存结果
 */
const searchCache = new LRUCache<string, SearchResult[]>({
  max: 100,
  ttl: 1000 * 30,
  updateAgeOnGet: true,
});

function searchCacheKey(query: string, type?: AssetType, limit?: number): string {
  return `${query}::${type ?? '*' }::${limit ?? 20}`;
}

/**
 * 转义 FTS5 查询中的特殊字符，防止注入攻击
 * 移除/替换 FTS5 语法操作符，保留纯文本搜索语义
 */
function sanitizeFts5Query(query: string): string {
  return query
    .replace(/"/g, '')                              // 移除双引号（防止短语注入）
    .replace(/[()*^\-+~]/g, ' ')                    // 替换 FTS5 操作符为空格
    .replace(/\b(AND|OR|NOT)\b/gi, ' ')             // 移除布尔操作符关键字
    .replace(/\s+/g, ' ')                           // 合并空白
    .trim();
}

function rowToMeta(row: Record<string, unknown>): AssetMeta {
  return {
    id: row.id as string,
    type: row.type as AssetType,
    name: row.name as string,
    description: row.description as string | undefined,
    tags: JSON.parse(row.tags as string) as string[],
    file_path: row.file_path as string,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

/** 搜索资产（使用 FTS5），支持类型过滤和结果缓存 */
export async function searchAssets(
  query: string,
  type?: AssetType,
  limit = 20
): Promise<SearchResult[]> {
  const safeQuery = sanitizeFts5Query(query);
  if (!safeQuery) return [];

  // 检查缓存
  const cacheKey = searchCacheKey(safeQuery, type, limit);
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const db = getDb();

  // Use FTS5 with rank for scoring
  const sql = type
    ? `SELECT a.*, fts.rank as fts_rank
       FROM assets_fts fts
       JOIN assets a ON a.id = fts.id
       WHERE assets_fts MATCH ? AND a.type = ?
       ORDER BY fts.rank
       LIMIT ?`
    : `SELECT a.*, fts.rank as fts_rank
       FROM assets_fts fts
       JOIN assets a ON a.id = fts.id
       WHERE assets_fts MATCH ?
       ORDER BY fts.rank
       LIMIT ?`;

  const params = type ? [safeQuery, type, limit] : [safeQuery, limit];

  let rows: Record<string, unknown>[];
  try {
    rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  } catch {
    // FTS5 query syntax error — return empty
    return [];
  }

  const results = rows.map(row => ({
    meta: rowToMeta(row),
    score: -(row.fts_rank as number), // rank is negative in FTS5
  }));

  // 写入缓存
  searchCache.set(cacheKey, results);
  return results;
}

/** 索引资产内容到 FTS5，并清空搜索缓存 */
export async function indexAssetContent(id: string, content: string): Promise<void> {
  const db = getDb();
  db.prepare('UPDATE assets_fts SET content = ? WHERE id = ?').run(content, id);
  // 内容变更后清空搜索缓存
  searchCache.clear();
}
