import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { indexAssetContent } from './search.js';
import {
  removeDependenciesForAsset,
  getDependents as getDependentsFromDeps,
  getDependencies as getDependenciesFromDeps,
  detectCircularDependency as detectCircularFromDeps,
} from './dependencies.js';
import type { AssetMeta, AssetType } from '../types.js';
import {
  getAssetFromCache,
  setAssetInCache,
  deleteAssetFromCache,
  getContentFromCache,
  setContentInCache,
  getListFromCache,
  setListInCache,
  getPaginatedFromCache,
  setPaginatedInCache,
  invalidateListCache,
  getCacheStats,
} from './cache.js';
import { getAssetsPaginated, getStats, streamAssets } from './pagination.js';
import chalk from 'chalk';

interface CreateAssetInput {
  type: AssetType;
  name: string;
  tags: string[];
  description?: string;
}

interface UpdateAssetInput {
  name?: string;
  description?: string;
  tags?: string[];
  content?: string;
}

function fileExtension(type: AssetType): string {
  if (type === 'mcp' || type === 'workflow' || type === 'agent') return '.yaml';
  return '.md';
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

/**
 * 创建资产（增强版，带缓存）
 */
export async function createAssetEnhanced(
  input: CreateAssetInput,
  content: string,
  baseDir: string
): Promise<AssetMeta> {
  const id = uuidv4();
  const now = Date.now();
  const ext = fileExtension(input.type);
  const safeName = basename(input.name).replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  const filePath = join(baseDir, input.type + 's', `${safeName}_${id}${ext}`);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');

  const db = getDb();
  db.prepare(
    `INSERT INTO assets (id, type, name, description, tags, file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.type,
    safeName,
    input.description ?? null,
    JSON.stringify(input.tags),
    filePath,
    now,
    now
  );

  await indexAssetContent(id, content);

  const asset = rowToMeta(
    db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>
  );

  // 更新缓存
  setAssetInCache(id, asset);
  setContentInCache(id, content);
  invalidateListCache();

  return asset;
}

/**
 * 获取资产（带缓存）
 */
export async function getAssetEnhanced(id: string): Promise<AssetMeta | null> {
  // 先从缓存获取
  const cached = getAssetFromCache(id);
  if (cached) {
    return cached;
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  
  if (!row) return null;

  const asset = rowToMeta(row);
  
  // 存入缓存
  setAssetInCache(id, asset);
  
  return asset;
}

/**
 * 列出资产（带缓存）
 */
export async function listAssetsEnhanced(type?: AssetType): Promise<AssetMeta[]> {
  // 先从缓存获取
  const cached = getListFromCache(type);
  if (cached) {
    return cached;
  }

  const db = getDb();
  const rows = type
    ? (db.prepare('SELECT * FROM assets WHERE type = ?').all(type) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM assets').all() as Record<string, unknown>[]);
  
  const assets = rows.map(rowToMeta);
  
  // 存入缓存
  setListInCache(type, assets);
  
  return assets;
}

/**
 * 更新资产（带缓存失效）
 */
export async function updateAssetEnhanced(id: string, input: UpdateAssetInput): Promise<AssetMeta> {
  const db = getDb();
  const now = Date.now();

  const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) throw new Error(`Asset not found: ${id}`);

  const name = input.name ?? (existing.name as string);
  const description =
    input.description !== undefined ? input.description : (existing.description as string | null);
  const tags = input.tags !== undefined ? JSON.stringify(input.tags) : (existing.tags as string);

  if (input.content !== undefined) {
    const filePath = existing.file_path as string;
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content, 'utf-8');
    await indexAssetContent(id, input.content);
    
    // 更新内容缓存
    setContentInCache(id, input.content);
  }

  db.prepare(
    `UPDATE assets SET name = ?, description = ?, tags = ?, updated_at = ? WHERE id = ?`
  ).run(name, description, tags, now, id);

  const updated = rowToMeta(
    db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>
  );

  // 更新缓存
  setAssetInCache(id, updated);
  invalidateListCache();

  return updated;
}

/**
 * 删除资产（带缓存失效）
 */
export async function deleteAssetEnhanced(id: string): Promise<void> {
  const db = getDb();

  removeDependenciesForAsset(id);

  const row = db.prepare('SELECT file_path FROM assets WHERE id = ?').get(id) as
    | { file_path: string }
    | undefined;

  if (row) {
    try {
      await unlink(row.file_path);
    } catch {
      // file may already be gone
    }
    db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  }

  // 清除缓存
  deleteAssetFromCache(id);
  invalidateListCache();
}

/**
 * 读取资产内容（带缓存）
 */
export async function readAssetContentEnhanced(id: string): Promise<string> {
  // 先从缓存获取
  const cached = getContentFromCache(id);
  if (cached) {
    return cached;
  }

  const db = getDb();
  const row = db.prepare('SELECT file_path FROM assets WHERE id = ?').get(id) as
    | { file_path: string }
    | undefined;
  if (!row) throw new Error(`Asset not found: ${id}`);
  
  const content = await readFile(row.file_path, 'utf-8');
  
  // 存入缓存
  setContentInCache(id, content);
  
  return content;
}

/**
 * 批量删除资产（增强版）
 */
export async function batchDeleteAssetsEnhanced(
  ids: string[],
  options: { force?: boolean; dryRun?: boolean } = {}
): Promise<{ deleted: string[]; blocked: string[]; errors: Array<{ id: string; error: string }> }> {
  const db = getDb();
  const result = {
    deleted: [] as string[],
    blocked: [] as string[],
    errors: [] as Array<{ id: string; error: string }>,
  };

  if (ids.length === 0) return result;

  // 验证所有资产是否存在
  const existingAssets = new Set<string>();
  for (const id of ids) {
    const asset = db.prepare('SELECT id FROM assets WHERE id = ?').get(id) as
      | { id: string }
      | undefined;
    if (asset) {
      existingAssets.add(id);
    } else {
      result.errors.push({ id, error: 'Asset not found' });
    }
  }

  if (existingAssets.size === 0) return result;

  // 如果不强制删除，检查依赖关系
  if (!options.force) {
    const dependencyMap = new Map<string, string[]>();

    const placeholders = existingAssets.size === 1 ? '?' : Array.from(existingAssets).map(() => '?').join(',');
    const dependentRows = db.prepare(`
      SELECT d.asset_id, d.depends_on_id, a.name
      FROM dependencies d
      JOIN assets a ON d.asset_id = a.id
      WHERE d.depends_on_id IN (${placeholders})
    `).all(...existingAssets) as Array<{ asset_id: string; depends_on_id: string; name: string }>;

    for (const row of dependentRows) {
      if (!dependencyMap.has(row.depends_on_id)) {
        dependencyMap.set(row.depends_on_id, []);
      }
      dependencyMap.get(row.depends_on_id)!.push(`${row.name} (${row.asset_id})`);
    }

    for (const id of existingAssets) {
      const dependents = dependencyMap.get(id) || [];
      if (dependents.length > 0) {
        result.blocked.push(id);
        console.log(chalk.yellow(`  ⚠ ${id} is depended on by: ${dependents.join(', ')}`));
      }
    }

    if (result.blocked.length > 0) {
      console.log(chalk.red(`\n❌ ${result.blocked.length} asset(s) blocked due to dependencies. Use --force to override.`));
      if (options.dryRun) {
        return result;
      }
      return result;
    }
  }

  // 执行删除
  if (options.dryRun) {
    result.deleted.push(...existingAssets);
    return result;
  }

  const transaction = db.transaction((idsToDelete: string[]) => {
    for (const id of idsToDelete) {
      try {
        removeDependenciesForAsset(id);

        const row = db.prepare('SELECT file_path FROM assets WHERE id = ?').get(id) as
          | { file_path: string }
          | undefined;

        if (row) {
          try {
            unlinkSync(row.file_path);
          } catch {
            // file may already be gone
          }
          db.prepare('DELETE FROM assets WHERE id = ?').run(id);
          result.deleted.push(id);
        }
      } catch (e) {
        result.errors.push({
          id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  });

  transaction(Array.from(existingAssets));

  // 清除缓存
  for (const id of result.deleted) {
    deleteAssetFromCache(id);
  }
  invalidateListCache();

  return result;
}

/**
 * 批量添加标签（增强版）
 */
export async function batchAddTagsEnhanced(
  ids: string[],
  tags: string[]
): Promise<{ updated: string[]; errors: Array<{ id: string; error: string }> }> {
  const db = getDb();
  const result = {
    updated: [] as string[],
    errors: [] as Array<{ id: string; error: string }>,
  };

  for (const id of ids) {
    try {
      const existing = db.prepare('SELECT tags FROM assets WHERE id = ?').get(id) as
        | { tags: string }
        | undefined;

      if (!existing) {
        result.errors.push({ id, error: 'Asset not found' });
        continue;
      }

      const currentTags = JSON.parse(existing.tags) as string[];
      const newTags = [...new Set([...currentTags, ...tags])];

      db.prepare('UPDATE assets SET tags = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(newTags), Date.now(), id);

      result.updated.push(id);
      
      // 清除缓存
      deleteAssetFromCache(id);
    } catch (e) {
      result.errors.push({
        id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (result.updated.length > 0) {
    invalidateListCache();
  }

  return result;
}

/**
 * 批量移除标签（增强版）
 */
export async function batchRemoveTagsEnhanced(
  ids: string[],
  tags: string[]
): Promise<{ updated: string[]; errors: Array<{ id: string; error: string }> }> {
  const db = getDb();
  const result = {
    updated: [] as string[],
    errors: [] as Array<{ id: string; error: string }>,
  };

  for (const id of ids) {
    try {
      const existing = db.prepare('SELECT tags FROM assets WHERE id = ?').get(id) as
        | { tags: string }
        | undefined;

      if (!existing) {
        result.errors.push({ id, error: 'Asset not found' });
        continue;
      }

      const currentTags = JSON.parse(existing.tags) as string[];
      const newTags = currentTags.filter(t => !tags.includes(t));

      db.prepare('UPDATE assets SET tags = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(newTags), Date.now(), id);

      result.updated.push(id);
      
      // 清除缓存
      deleteAssetFromCache(id);
    } catch (e) {
      result.errors.push({
        id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (result.updated.length > 0) {
    invalidateListCache();
  }

  return result;
}

/**
 * 获取缓存统计信息
 */
export function getCacheStatistics() {
  return getCacheStats();
}

/**
 * 获取系统统计信息
 */
export async function getSystemStats() {
  return await getStats();
}

/**
 * 流式处理资产
 */
export async function* streamAssetsEnhanced(type?: AssetType, batchSize: number = 100) {
  yield* streamAssets(type, batchSize);
}

// 导出所有函数
export {
  cloneAsset,
  detectCircularDependencies,
  createDependency as createDependency,
  removeDependenciesForAsset as deleteDependency,
  isAssetUsed,
  getDependents,
  getDependencies,
  indexAssetContent,
} from './dependencies.js';

// 同步文件操作
import { unlinkSync } from 'fs';
