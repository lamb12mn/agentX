import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { ensureExecutionTables } from './executions.js';

let db: Database.Database | undefined;

/** 初始化 SQLite 数据库，创建表结构和索引 */
export function initDb(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      tags TEXT DEFAULT '[]',
      file_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
    CREATE INDEX IF NOT EXISTS idx_assets_name ON assets(name);

    -- 依赖关系表：记录资产之间的依赖
    CREATE TABLE IF NOT EXISTS dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id TEXT NOT NULL,
      depends_on_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on_id) REFERENCES assets(id) ON DELETE CASCADE,
      UNIQUE(asset_id, depends_on_id)
    );
    CREATE INDEX IF NOT EXISTS idx_dependencies_asset ON dependencies(asset_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_depends_on ON dependencies(depends_on_id);

    -- 版本快照表：记录资产的完整历史
    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      UNIQUE(asset_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_versions_asset ON versions(asset_id);

    -- 批量操作日志表（可选审计）
    CREATE TABLE IF NOT EXISTS batch_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      asset_ids TEXT NOT NULL,
      params TEXT,
      result_count INTEGER,
      success BOOLEAN,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 同步追踪表：记录资产同步状态
    CREATE TABLE IF NOT EXISTS sync_tracking (
      asset_id TEXT PRIMARY KEY,
      sync_status TEXT DEFAULT 'pending',
      last_synced_at INTEGER,
      remote_version INTEGER,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sync_tracking_status ON sync_tracking(sync_status);

    CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
      id UNINDEXED,
      name,
      description,
      content,
      tokenize = 'unicode61'
    );
    CREATE TRIGGER IF NOT EXISTS assets_fts_insert AFTER INSERT ON assets BEGIN
      INSERT INTO assets_fts(id, name, description) VALUES (new.id, new.name, COALESCE(new.description, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS assets_fts_update AFTER UPDATE ON assets BEGIN
      UPDATE assets_fts SET name = new.name, description = COALESCE(new.description, '') WHERE id = new.id;
    END;
    CREATE TRIGGER IF NOT EXISTS assets_fts_delete AFTER DELETE ON assets BEGIN
      DELETE FROM assets_fts WHERE id = old.id;
    END;
  `);

  // 初始化执行会话表（幂等）
  ensureExecutionTables();
}

/** 获取数据库实例，未初始化时抛出错误 */
export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized. Call initDb() first.');
  return db;
}

/** 关闭数据库连接 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined;
  }
}
