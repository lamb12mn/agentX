import { EventEmitter } from 'events';
import type { AssetMeta } from '../types.js';

export interface SyncConfig {
  endpoint: string;
  apiKey: string;
  syncInterval: number;
  autoSync: boolean;
}

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: string[];
}

export interface SyncStatus {
  lastSync: number | null;
  isSyncing: boolean;
  pendingUploads: number;
  pendingDownloads: number;
  totalAssets: number;
}

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
  }

  /**
   * 获取待上传的资产
   */
  private async getPendingUploads(): Promise<AssetMeta[]> {
    // 这里应该查询本地数据库获取待上传的资产
    // 简化实现：返回空数组
    return [];
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
   * 应用远程更改
   */
  private async applyRemoteChange(change: AssetMeta): Promise<boolean> {
    // 检查是否有冲突
    const hasConflict = await this.checkConflict(change);
    
    if (hasConflict) {
      this.emit('conflict', change);
      return true;
    }

    // 应用更改
    this.emit('changeApplied', change);
    return false;
  }

  /**
   * 检查冲突
   */
  private async checkConflict(change: AssetMeta): Promise<boolean> {
    // 简化实现：检查本地是否有更新的版本
    const localVersion = await this.getLocalVersion(change.id);
    return localVersion ? localVersion.updated_at > change.updated_at : false;
  }

  /**
   * 获取本地版本
   */
  private async getLocalVersion(id: string): Promise<AssetMeta | null> {
    // 这里应该查询本地数据库
    // 简化实现：返回null
    return null;
  }

  /**
   * 获取同步状态
   */
  getStatus(): SyncStatus {
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
