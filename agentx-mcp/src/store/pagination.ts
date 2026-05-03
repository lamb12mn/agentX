import type { AssetMeta, AssetType } from '../types.js';
import { getDb } from './db.js';
import type { PaginationOptions, PaginatedResult } from '../types/pagination.js';

/**
 * 分页查询资产
 */
export async function getAssetsPaginated(
  options: PaginationOptions = {}
): Promise<PaginatedResult<AssetMeta>> {
  const {
    page = 1,
    pageSize = 20,
    type,
    search,
    sortBy = 'created_at',
    sortOrder = 'desc',
    filters,
  } = options;

  const db = getDb();
  const offset = (page - 1) * pageSize;

  // 构建基础查询
  let query = 'SELECT * FROM assets WHERE 1=1';
  const queryParams: any[] = [];

  // 类型过滤
  if (type) {
    query += ' AND type = ?';
    queryParams.push(type);
  }

  // 搜索过滤（使用FTS5全文搜索）
  if (search) {
    query += ` AND id IN (
      SELECT rowid FROM assets_fts 
      WHERE assets_fts MATCH ?
      ORDER BY rank
    )`;
    queryParams.push(`${search}*`);
  }

  // 标签过滤
  if (filters?.tags && filters.tags.length > 0) {
    const tagConditions = filters.tags.map(() => 'tags LIKE ?').join(' AND ');
    query += ` AND (${tagConditions})`;
    queryParams.push(...filters.tags.map(tag => `%"${tag}"%`));
  }

  // 时间范围过滤
  if (filters?.dateRange) {
    if (filters.dateRange.start) {
      query += ' AND created_at >= ?';
      queryParams.push(filters.dateRange.start);
    }
    if (filters.dateRange.end) {
      query += ' AND created_at <= ?';
      queryParams.push(filters.dateRange.end);
    }
  }

  // 状态过滤
  if (filters?.status) {
    query += ' AND status = ?';
    queryParams.push(filters.status);
  }

  // 获取总数
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
  const totalResult = db.prepare(countQuery).get(...queryParams) as { count: number };
  const total = totalResult.count;

  // 排序
  const validSortFields = ['name', 'type', 'created_at', 'updated_at'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
  const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${sortField} ${sortDirection}`;

  // 分页
  query += ' LIMIT ? OFFSET ?';
  queryParams.push(pageSize, offset);

  // 执行查询
  const rows = db.prepare(query).all(...queryParams) as Record<string, unknown>[];
  const data = rows.map(rowToMeta);

  // 计算分页信息
  const totalPages = Math.ceil(total / pageSize);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
  };
}

/**
 * 批量获取资产（用于导出等场景）
 */
export async function getAssetsBatch(
  ids: string[],
  batchSize: number = 100
): Promise<AssetMeta[]> {
  const results: AssetMeta[] = [];
  const db = getDb();

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM assets WHERE id IN (${placeholders})`)
      .all(...batch) as Record<string, unknown>[];
    results.push(...rows.map(rowToMeta));
  }

  return results;
}

/**
 * 流式查询大量数据
 */
export async function* streamAssets(
  type?: AssetType,
  batchSize: number = 100
): AsyncGenerator<AssetMeta[], void, unknown> {
  const db = getDb();
  let offset = 0;

  while (true) {
    let query = 'SELECT * FROM assets';
    const params: any[] = [];

    if (type) {
      query += ' WHERE type = ?';
      params.push(type);
    }

    query += ' LIMIT ? OFFSET ?';
    params.push(batchSize, offset);

    const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
    
    if (rows.length === 0) {
      break;
    }

    yield rows.map(rowToMeta);
    offset += batchSize;
  }
}

/**
 * 获取统计信息
 */
export async function getStats(): Promise<{
  totalAssets: number;
  assetsByType: Record<AssetType, number>;
  recentActivity: number;
}> {
  const db = getDb();
  
  const totalResult = db.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number };
  
  const typeResults = db.prepare(`
    SELECT type, COUNT(*) as count 
    FROM assets 
    GROUP BY type
  `).all() as Array<{ type: AssetType; count: number }>;
  
  const assetsByType: Record<AssetType, number> = {
    skill: 0,
    prompt: 0,
    rule: 0,
    mcp: 0,
    workflow: 0,
    agent: 0,
  };
  
  for (const result of typeResults) {
    assetsByType[result.type] = result.count;
  }

  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const recentResult = db.prepare(
    'SELECT COUNT(*) as count FROM assets WHERE updated_at >= ?'
  ).get(oneWeekAgo) as { count: number };

  return {
    totalAssets: totalResult.count,
    assetsByType,
    recentActivity: recentResult.count,
  };
}

// 辅助函数
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
