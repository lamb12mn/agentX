import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { logAudit } from '../audit/index.js';
import { join, dirname, basename, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { indexAssetContent } from './search.js';
import {
  removeDependenciesForAsset,
  getDependents as getDependentsFromDeps,
  getDependencies as getDependenciesFromDeps,
  detectCircularDependency as detectCircularFromDeps,
  addDependency,
} from './dependencies.js';
import type { AssetMeta, AssetType } from '../types.js';
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

export async function createAsset(
  input: CreateAssetInput,
  content: string,
  baseDir: string
): Promise<AssetMeta> {
  const id = uuidv4();
  const now = Date.now();
  const ext = fileExtension(input.type);
  const safeName = basename(input.name).replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  const filePath = join(baseDir, input.type + 's', `${safeName}${ext}`);

  // 路径遍历防护：确保最终路径在 baseDir 之内
  const resolvedBase = resolve(baseDir);
  const resolvedPath = resolve(filePath);
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error(`Path traversal detected for asset "${input.name}"`);
  }

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

  return rowToMeta(
    db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>
  );
}

export async function getAsset(id: string): Promise<AssetMeta | null> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToMeta(row) : null;
}

export async function listAssets(type?: AssetType): Promise<AssetMeta[]> {
  const db = getDb();
  const rows = type
    ? (db.prepare('SELECT * FROM assets WHERE type = ?').all(type) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM assets').all() as Record<string, unknown>[]);
  return rows.map(rowToMeta);
}

export async function updateAsset(id: string, input: UpdateAssetInput): Promise<AssetMeta> {
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
  }

  db.prepare(
    `UPDATE assets SET name = ?, description = ?, tags = ?, updated_at = ? WHERE id = ?`
  ).run(name, description, tags, now, id);

  return rowToMeta(
    db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>
  );
}

export async function deleteAsset(id: string): Promise<void> {
  const db = getDb();

  // 删除前清理依赖关系
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
}

export async function readAssetContent(id: string): Promise<string> {
  const db = getDb();
  const row = db.prepare('SELECT file_path FROM assets WHERE id = ?').get(id) as
    | { file_path: string }
    | undefined;
  if (!row) throw new Error(`Asset not found: ${id}`);
  return readFile(row.file_path, 'utf-8');
}

/**
 * 批量删除资产（带依赖检查）
 */
export async function batchDeleteAssets(
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

    // 批量查询依赖关系
    const placeholders = existingAssets.size === 1 ? '?' : Array.from(existingAssets).map(() => '?').join(',');
    const dependentRows = db.prepare(`
      SELECT d.asset_id, d.depends_on_id, a.name
      FROM dependencies d
      JOIN assets a ON d.asset_id = a.id
      WHERE d.depends_on_id IN (${placeholders})
    `).all(...existingAssets) as Array<{ asset_id: string; depends_on_id: string; name: string }>;

    // 构建依赖映射：被依赖的资产 -> 依赖它的资产列表
    for (const row of dependentRows) {
      if (!dependencyMap.has(row.depends_on_id)) {
        dependencyMap.set(row.depends_on_id, []);
      }
      dependencyMap.get(row.depends_on_id)!.push(`${row.name} (${row.asset_id})`);
    }

    // 找出被依赖的资产
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
      return result; // 不执行删除
    }
  }

  // 执行删除（dryRun模式只返回不实际删除）
  if (options.dryRun) {
    result.deleted.push(...existingAssets);
    return result;
  }

  // 使用事务批量删除
  const transaction = db.transaction((idsToDelete: string[]) => {
    for (const id of idsToDelete) {
      try {
        // 清理依赖
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

  return result;
}

/**
 * 批量添加标签
 */
export async function batchAddTags(
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
    } catch (e) {
      result.errors.push({
        id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

/**
 * 批量移除标签
 */
export async function batchRemoveTags(
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
    } catch (e) {
      result.errors.push({
        id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

// 导出依赖管理函数
export { addDependency as createDependency, removeDependenciesForAsset as deleteDependency, isAssetUsed } from './dependencies.js';
export { getDependents as getDependents, getDependencies as getDependencies } from './dependencies.js';
// 重新导出搜索函数供其他模块使用
export { indexAssetContent } from './search.js';

/**
 * 检测循环依赖并返回循环路径
 */
export function detectCircularDependencies(assetId: string): string[] {
  const db = getDb();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycle: string[] = [];

  function dfs(currentId: string): boolean {
    if (stack.includes(currentId)) {
      // 找到循环
      const idx = stack.indexOf(currentId);
      cycle.push(...stack.slice(idx));
      cycle.push(currentId);
      return true;
    }

    if (visited.has(currentId)) return false;

    visited.add(currentId);
    stack.push(currentId);

    const deps = getDependenciesFromDeps(currentId);
    for (const dep of deps) {
      if (dfs(dep)) return true;
    }

    stack.pop();
    return false;
  }

  dfs(assetId);
  return cycle;
}

// 同步文件操作
import { unlinkSync } from 'fs';

/**
 * 克隆资产（创建副本）
 * @param sourceId 源资产ID
 * @param newName 新资产名称（可选，默认为"原名称 - Copy"）
 * @param baseDir 基础目录
 * @returns 克隆后的新资产元数据
 */
export async function cloneAsset(
  sourceId: string,
  newName?: string,
  baseDir: string = process.cwd()
): Promise<AssetMeta> {
  // 获取源资产
  const sourceAsset = await getAsset(sourceId);
  if (!sourceAsset) {
    throw new Error(`Asset not found: ${sourceId}`);
  }

  // 读取源内容
  const content = await readAssetContent(sourceId);

  // 确定新名称
  const clonedName = newName || `${sourceAsset.name} - Copy`;

  // 创建新资产
  const newAsset = await createAsset(
    {
      type: sourceAsset.type,
      name: clonedName,
      tags: [...sourceAsset.tags],
      description: sourceAsset.description ? `Cloned from ${sourceAsset.name} (${sourceId})` : undefined,
    },
    content,
    baseDir
  );

  // 复制依赖关系（使用已导入的函数）
  const deps = getDependenciesFromDeps(sourceId);
  for (const depId of deps) {
    addDependency(newAsset.id, depId);
  }

  return newAsset;
}