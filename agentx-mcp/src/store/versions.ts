import { getDb } from './db.js';
import { readAssetContent, getAsset, indexAssetContent } from './assets.js';
import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import type { AssetMeta } from '../types.js';

/**
 * Represents a version snapshot of an asset, storing both metadata and content
 * at a specific point in time for rollback and audit purposes.
 */
export interface VersionSnapshot {
  id: number;
  asset_id: string;
  version: number;
  snapshot_data: {
    meta: {
      id: string;
      type: string;
      name: string;
      description?: string;
      tags: string[];
      file_path: string;
      created_at: number;
      updated_at: number;
    };
    content: string;
  };
  created_at: string;
  created_by?: string;
}

/**
 * 创建资产版本快照
 * @param assetId 资产ID
 * @param createdBy 创建者（可选，用于记录）
 * @returns 创建的版本号
 */
export async function createVersionSnapshot(assetId: string, createdBy?: string): Promise<number> {
  const db = getDb();

  // 获取资产元数据
  const asset = await getAsset(assetId);
  if (!asset) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  // 读取资产内容
  const content = await readAssetContent(assetId);

  // 构建快照数据
  const snapshotData = {
    meta: {
      id: asset.id,
      type: asset.type,
      name: asset.name,
      description: asset.description,
      tags: asset.tags,
      file_path: asset.file_path,
      created_at: asset.created_at,
      updated_at: asset.updated_at,
    },
    content,
  };

  // 获取当前最大版本号
  const maxVersionRow = db.prepare('SELECT MAX(version) as max_version FROM versions WHERE asset_id = ?').get(assetId) as
    | { max_version: number | null }
    | undefined;

  const nextVersion = (maxVersionRow?.max_version ?? 0) + 1;

  // 插入快照
  db.prepare(
    `INSERT INTO versions (asset_id, version, snapshot_data, created_at, created_by)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)`
  ).run(assetId, nextVersion, JSON.stringify(snapshotData), createdBy ?? null);

  return nextVersion;
}

/**
 * 列出资产的所有版本
 * @param assetId 资产ID
 * @returns 版本列表（按版本号降序排列）
 */
export function listVersions(assetId: string): VersionSnapshot[] {
  const db = getDb();

  const rows = db.prepare(
    `SELECT id, asset_id, version, snapshot_data, created_at, created_by
     FROM versions
     WHERE asset_id = ?
     ORDER BY version DESC`
  ).all(assetId) as Array<{
    id: number;
    asset_id: string;
    version: number;
    snapshot_data: string;
    created_at: string;
    created_by: string | null;
  }>;

  return rows.map(row => ({
    id: row.id,
    asset_id: row.asset_id,
    version: row.version,
    snapshot_data: JSON.parse(row.snapshot_data),
    created_at: row.created_at,
    created_by: row.created_by ?? undefined,
  }));
}

/**
 * 获取指定版本快照
 * @param assetId 资产ID
 * @param version 版本号
 * @returns 版本快照
 */
export function getVersion(assetId: string, version: number): VersionSnapshot | null {
  const db = getDb();

  const row = db.prepare(
    `SELECT id, asset_id, version, snapshot_data, created_at, created_by
     FROM versions
     WHERE asset_id = ? AND version = ?`
  ).get(assetId, version) as
    | {
        id: number;
        asset_id: string;
        version: number;
        snapshot_data: string;
        created_at: string;
        created_by: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    asset_id: row.asset_id,
    version: row.version,
    snapshot_data: JSON.parse(row.snapshot_data),
    created_at: row.created_at,
    created_by: row.created_by ?? undefined,
  };
}

/**
 * 回滚资产到指定版本
 * @param assetId 资产ID
 * @param version 目标版本号
 * @returns 回滚后的资产元数据
 */
export async function rollbackToVersion(assetId: string, version: number): Promise<AssetMeta> {
  const versionSnapshot = getVersion(assetId, version);
  if (!versionSnapshot) {
    throw new Error(`Version ${version} not found for asset ${assetId}`);
  }

  const { meta, content } = versionSnapshot.snapshot_data;

  // 恢复文件内容
  await mkdir(dirname(meta.file_path), { recursive: true });
  await writeFile(meta.file_path, content, 'utf-8');

  // 更新数据库记录
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `UPDATE assets
     SET name = ?, description = ?, tags = ?, updated_at = ?
     WHERE id = ?`
  ).run(meta.name, meta.description ?? null, JSON.stringify(meta.tags), now, assetId);

  // 重新索引内容
  await indexAssetContent(assetId, content);

  // 返回更新后的元数据
  return {
    ...meta,
    updated_at: now,
  } as AssetMeta;
}

/**
 * 清除资产的所有版本历史
 * @param assetId 资产ID
 * @returns 删除的版本数量
 */
export function clearVersions(assetId: string): number {
  const db = getDb();
  const info = db.prepare('DELETE FROM versions WHERE asset_id = ?').run(assetId);
  return info.changes;
}

/**
 * 获取资产的版本统计信息
 * @param assetId 资产ID
 * @returns 版本统计
 */
export function getVersionStats(assetId: string): { total: number; latest: number; firstCreatedAt: string | null } {
  const db = getDb();

  const rows = db.prepare(
    `SELECT COUNT(*) as total, MAX(version) as latest, MIN(created_at) as first_created
     FROM versions WHERE asset_id = ?`
  ).get(assetId) as
    | { total: number; latest: number | null; first_created: string | null }
    | undefined;

  if (!rows || rows.total === 0) {
    return { total: 0, latest: 0, firstCreatedAt: null };
  }

  return {
    total: rows.total,
    latest: rows.latest ?? 0,
    firstCreatedAt: rows.first_created,
  };
}

