import fs from 'fs';
import path from 'path';
import os from 'os';

const AUDIT_LOG_PATH = path.join(process.env.AGENTX_HOME || os.homedir(), '.agentx', 'audit.log');
const AUDIT_DIR = path.dirname(AUDIT_LOG_PATH);

// 确保日志目录存在
if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

/** 审计日志支持的 action 类型 */
export type AuditAction =
    | 'CREATE_ASSET'
    | 'UPDATE_ASSET'
    | 'DELETE_ASSET'
    | 'BATCH_DELETE'
    | 'IMPORT_ASSET'
    | 'EXPORT_ASSET'
    | 'CLONE_ASSET';

/** 审计日志条目 */
export interface AuditEntry {
    /** ISO 时间戳 */
    timestamp: string;
    /** 操作类型 */
    action: AuditAction;
    /** 操作用户 ID */
    userId: string;
    /** 关联资产 ID */
    assetId?: string;
    /** 附加详情 */
    details?: any;
    /** 客户端 IP */
    ip?: string;
}

/** 写入审计日志条目 */
export function logAudit(entry: AuditEntry): void {
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(AUDIT_LOG_PATH, logLine, 'utf8');
}

/**
 * Query audit log entries with optional filters.
 * @param options - Filter options including action, assetId, date range, and limit
 * @returns Array of matching audit entries, sorted by time ascending
 */
export function queryAudit(options: {
    action?: AuditAction;
    assetId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
}): AuditEntry[] {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
    const lines = fs.readFileSync(AUDIT_LOG_PATH, 'utf8').split('\n').filter(l => l.trim());
    let entries = lines.map(line => JSON.parse(line) as AuditEntry);
    
    if (options.action) {
        entries = entries.filter(e => e.action === options.action);
    }
    if (options.assetId) {
        entries = entries.filter(e => e.assetId === options.assetId);
    }
    if (options.from) {
        entries = entries.filter(e => new Date(e.timestamp) >= options.from!);
    }
    if (options.to) {
        entries = entries.filter(e => new Date(e.timestamp) <= options.to!);
    }
    if (options.limit && options.limit > 0) {
        entries = entries.slice(-options.limit);
    }
    return entries;
}
