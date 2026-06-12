import { EventEmitter } from 'events';
import { getDb } from '../store/db.js';
import type { AssetMeta } from '../types.js';

/**
 * Configuration for cloud sync service
 */
export interface SyncConfig {
  endpoint: string;
  apiKey: string;
  syncInterval: number;
  autoSync: boolean;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: string[];
}

/**
 * Current status of the sync service
 */
export interface SyncStatus {
  lastSync: number | null;
  isSyncing: boolean;
  pendingUploads: number;
  pendingDownloads: number;
  totalAssets: number;
}

/**
 * Cloud sync service for synchronizing assets with a remote endpoint
 * Extends EventEmitter for sync lifecycle events
 */
export class CloudSyncService extends EventEmitter {
  private config: SyncConfig | null = null;
  private status: SyncStatus = {
    lastSync: null,
    isSyncing: false,
    pendingUploads: 0,
    pendingDownloads: 0,
    totalAssets: 0,
  };
  private syncTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * 配置同步服务
   */
  configure(config: SyncConfig): void {
    this.config = config;
    this.emit('configured', config);

    if (config.autoSync) {
      this.startAutoSync();
    }
  }

  /**
   * 开始自动同步
   */
  startAutoSync(): void {
    if (!this.config) {
      throw new Error('Sync service not configured');
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      this.sync().catch(error => {
        this.emit('syncError', error);
      });
    }, this.config.syncInterval);

    this.emit('autoSyncStarted', this.config.syncInterval);
  }

  /**
   * 停止自动同步
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.emit('autoSyncStopped');
  }

  /**
   * 执行同步
   */
  async sync(): Promise<SyncResult> {
    if (!this.config) {
      throw new Error('Sync service not configured');
    }

    if (this.status.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.status.isSyncing = true;
    this.emit('syncStart');

    const result: SyncResult = {
      success: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      errors: [],
    };

    try {
      // 上传本地更改
      const uploadResult = await this.uploadChanges();
      result.uploaded = uploadResult.uploaded;
      result.errors.push(...uploadResult.errors);

      // 下载远程更改
      const downloadResult = await this.downloadChanges();
      result.downloaded = downloadResult.downloaded;
      result.conflicts += downloadResult.conflicts;
      result.errors.push(...downloadResult.errors);

      result.success = result.errors.length === 0;
      this.status.lastSync = Date.now();
      
      this.emit('syncComplete', result);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      this.emit('syncError', error);
    } finally {
      this.status.isSyncing = false;
    }

    return result;
  }

  /**
   * 上传本地更改
   */
  private async uploadChanges(): Promise<{
    uploaded: number;
    errors: string[];
  }> {
    const result = {
      uploaded: 0,
      errors: [] as string[],
    };

    // 获取待上传的资产
    const pendingAssets = await this.getPendingUploads();
    
    for (const asset of pendingAssets) {
      try {
        await this.uploadAsset(asset);
        result.uploaded++;
        this.emit('assetUploaded', asset);
      } catch (error) {
        result.errors.push(`Failed to upload ${asset.id}: ${error}`);
      }
    }

    return result;
  }

  /**
   * 下载远程更改
   */
  private async downloadChanges(): Promise<{
    downloaded: number;
    conflicts: number;
    errors: string[];
  }> {
    const result = {
      downloaded: 0,
      conflicts: 0,
      errors: [] as string[],
    };

    // 获取远程更改
    const remoteChanges = await this.fetchRemoteChanges();
    
    for (const change of remoteChanges) {
      try {
        const conflict = await this.applyRemoteChange(change);
        if (conflict) {
          result.conflicts++;
          this.emit('conflictDetected', change);
        } else {
          result.downloaded++;
          this.emit('assetDownloaded', change);
        }
      } catch (error) {
        result.errors.push(`Failed to download ${change.id}: ${error}`);
      }
    }

    return result;
  }

  /**
   * 上传单个资产
   */
  private async uploadAsset(asset: AssetMeta): Promise<void> {
    if (!this.config) {
      throw new Error('Sync service not configured');
    }

    const response = await fetch(`${this.config.endpoint}/assets/${asset.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(asset),
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    // 上传成功后标记已同步
    this.markAsSynced(asset.id);
  }

  /**
   * 标记资产已同步
   */
  private markAsSynced(assetId: string): void {
    try {
      const db = getDb();
      db.prepare(
        `INSERT OR REPLACE INTO sync_tracking (asset_id, sync_status, last_synced_at)
         VALUES (?, 'synced', ?)`
      ).run(assetId, Date.now());
    } catch (error) {
      // 标记失败不影响主流程，仅记录
      this.emit('syncError', `markAsSynced failed for ${assetId}: ${error}`);
    }
  }

  /**
   * 获取待上传的资产
   */
  private async getPendingUploads(): Promise<AssetMeta[]> {
    try {
      const db = getDb();
      const rows = db.prepare(
        `SELECT a.* FROM assets a
         LEFT JOIN sync_tracking s ON s.asset_id = a.id
         WHERE s.asset_id IS NULL OR s.sync_status = 'pending'`
      ).all() as Record<string, unknown>[];
      return rows.map(r => this.rowToMeta(r));
    } catch {
      return [];
    }
  }

  private rowToMeta(row: Record<string, unknown>): AssetMeta {
    return {
      id: row.id as string,
      type: row.type as AssetMeta['type'],
      name: row.name as string,
      description: row.description as string | undefined,
      tags: JSON.parse(row.tags as string) as string[],
      file_path: row.file_path as string,
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    };
  }

  /**
   * 获取远程更改
   */
  private async fetchRemoteChanges(): Promise<AssetMeta[]> {
    if (!this.config) {
      throw new Error('Sync service not configured');
    }

    const response = await fetch(`${this.config.endpoint}/changes?since=${this.status.lastSync || 0}`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch changes: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 应用远程更改（写入本地数据库）
   */
  private async applyRemoteChange(change: AssetMeta): Promise<boolean> {
    // 检查是否有冲突
    const hasConflict = await this.checkConflict(change);
    
    if (hasConflict) {
      this.emit('conflict', change);
      return true;
    }

    // 写入本地数据库（upsert）
    try {
      const db = getDb();
      const existing = db.prepare('SELECT id, updated_at FROM assets WHERE id = ?').get(change.id) as
        { id: string; updated_at: number } | undefined;

      if (existing) {
        // 远程版本更新 → 更新本地
        db.prepare(`
          UPDATE assets SET type = ?, name = ?, description = ?, tags = ?,
            file_path = ?, updated_at = ?
          WHERE id = ?
        `).run(change.type, change.name, change.description ?? null, JSON.stringify(change.tags ?? []),
          change.file_path, change.updated_at, change.id);
      } else {
        // 远程新增 → 插入本地
        db.prepare(`
          INSERT INTO assets (id, type, name, description, tags, file_path, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(change.id, change.type, change.name, change.description ?? null,
          JSON.stringify(change.tags ?? []), change.file_path, change.created_at, change.updated_at);
      }

      // 标记同步状态
      db.prepare(
        `INSERT OR REPLACE INTO sync_tracking (asset_id, sync_status, last_synced_at)
         VALUES (?, 'synced', ?)`
      ).run(change.id, Date.now());

      this.emit('changeApplied', change);
    } catch (error) {
      this.emit('syncError', `applyRemoteChange failed for ${change.id}: ${error}`);
      throw error;
    }

    return false;
  }

  /**
   * 检查冲突
   */
  private async checkConflict(change: AssetMeta): Promise<boolean> {
    // 查询本地是否有更新的版本
    const localVersion = await this.getLocalVersion(change.id);
    return localVersion ? localVersion.updated_at > change.updated_at : false;
  }

  /**
   * 获取本地版本
   */
  private async getLocalVersion(id: string): Promise<AssetMeta | null> {
    try {
      const db = getDb();
      const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      return row ? this.rowToMeta(row) : null;
    } catch {
      return null;
    }
  }

  /**
   * 更新 totalAssets 为本地真实数量
   */
  private updateTotalAssets(): void {
    try {
      const db = getDb();
      const row = db.prepare('SELECT COUNT(*) AS cnt FROM assets').get() as { cnt: number };
      this.status.totalAssets = row.cnt;
    } catch {
      // 静默失败，保留旧值
    }
  }

  /**
   * 获取同步状态
   */
  getStatus(): SyncStatus {
    // 每次获取时刷新资产总数
    this.updateTotalAssets();
    return { ...this.status };
  }

  /**
   * 手动触发同步
   */
  async forceSync(): Promise<SyncResult> {
    return this.sync();
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stopAutoSync();
    this.removeAllListeners();
  }
}
