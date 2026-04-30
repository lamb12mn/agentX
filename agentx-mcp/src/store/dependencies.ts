import { getDb } from './db.js';
import type { AssetMeta } from '../types.js';

/**
 * 依赖管理模块
 * 负责资产依赖关系的记录、查询、验证
 */

export interface DependencyInfo {
  asset_id: string;
  asset_name: string;
  asset_type: string;
  depends_on_id: string;
  depends_on_name: string;
  depends_on_type: string;
}

/**
 * 添加依赖关系
 */
export function addDependency(assetId: string, dependsOnId: string): void {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO dependencies (asset_id, depends_on_id) VALUES (?, ?)`
    ).run(assetId, dependsOnId);
  } catch (e) {
    // 忽略重复依赖错误
    if (!(e as Error).message.includes('UNIQUE constraint failed')) {
      throw e;
    }
  }
}

/**
 * 删除资产的所有依赖
 */
export function removeDependenciesForAsset(assetId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM dependencies WHERE asset_id = ? OR depends_on_id = ?').run(assetId, assetId);
}

/**
 * 检查资产是否被其他资产依赖
 * @returns 依赖此资产的资产ID列表
 */
export function getDependents(assetId: string): string[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT asset_id FROM dependencies WHERE depends_on_id = ?`
  ).all(assetId) as Array<{ asset_id: string }>;
  return rows.map(r => r.asset_id);
}

/**
 * 获取资产依赖的其他资产
 * @returns 此资产依赖的资产ID列表
 */
export function getDependencies(assetId: string): string[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT depends_on_id FROM dependencies WHERE asset_id = ?`
  ).all(assetId) as Array<{ depends_on_id: string }>;
  return rows.map(r => r.depends_on_id);
}

/**
 * 检查删除是否安全（无依赖关系）
 * @returns { safe: boolean; dependents: string[]; dependencies: string[] }
 */
export function checkDeleteSafety(assetId: string): { safe: boolean; dependents: string[]; dependencies: string[] } {
  const dependents = getDependents(assetId);
  const dependencies = getDependencies(assetId);
  return {
    safe: dependents.length === 0,
    dependents,
    dependencies,
  };
}

/**
 * 获取资产的完整依赖图（递归）
 */
export function getDependencyGraph(assetId: string): DependencyInfo[] {
  const db = getDb();
  const graph: DependencyInfo[] = [];

  // 获取直接依赖
  const rows = db.prepare(`
    SELECT
      a.id as asset_id, a.name as asset_name, a.type as asset_type,
      d.depends_on_id, b.name as depends_on_name, b.type as depends_on_type
    FROM dependencies d
    JOIN assets a ON d.asset_id = a.id
    JOIN assets b ON d.depends_on_id = b.id
    WHERE d.asset_id = ?
  `).all(assetId) as Array<DependencyInfo>;

  graph.push(...rows);

  // 递归获取间接依赖
  for (const dep of rows) {
    const subGraph = getDependencyGraph(dep.depends_on_id);
    graph.push(...subGraph);
  }

  return graph;
}

/**
 * 检测循环依赖（从指定资产开始DFS）
 */
export function detectCircularDependency(assetId: string, visited: Set<string> = new Set()): boolean {
  const db = getDb();

  if (visited.has(assetId)) {
    return true; // 发现循环
  }

  visited.add(assetId);
  const deps = getDependencies(assetId);

  for (const depId of deps) {
    if (detectCircularDependency(depId, new Set(visited))) {
      return true;
    }
  }

  return false;
}

/**
 * 批量检查多个资产的依赖状态
 */
export function batchCheckDependencies(assetIds: string[]): Map<string, { safe: boolean; dependents: string[]; dependencies: string[] }> {
  const result = new Map<string, { safe: boolean; dependents: string[]; dependencies: string[] }>();
  for (const id of assetIds) {
    result.set(id, checkDeleteSafety(id));
  }
  return result;
}

/**
 * 检查资产是否被其他资产使用（依赖）
 */
export function isAssetUsed(assetId: string): boolean {
  return getDependents(assetId).length > 0;
}
