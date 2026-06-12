import fs from 'fs';
import path from 'path';
import os from 'os';

const AUDIT_LOG_PATH = path.join(process.env.AGENTX_HOME || os.homedir(), '.agentx', 'audit.log');
const AUDIT_DIR = path.dirname(AUDIT_LOG_PATH);

// 确保日志目录存在
if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

export type AuditAction = 
    | 'CREATE_ASSET'
    | 'UPDATE_ASSET'
    | 'DELETE_ASSET'
    | 'BATCH_DELETE'
    | 'IMPORT_ASSET'
    | 'EXPORT_ASSET'
    | 'CLONE_ASSET';

export interface AuditEntry {
    timestamp: string;
    action: AuditAction;
    userId: string;
    assetId?: string;
    details?: any;
    ip?: string;
}

export function logAudit(entry: AuditEntry): void {
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(AUDIT_LOG_PATH, logLine, 'utf8');
}

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
