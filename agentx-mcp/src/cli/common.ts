import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../store/db.js';

export function getBaseDir(): string {
  return process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
}

export function getDbPath(): string {
  return join(getBaseDir(), 'agentx.db');
}

export function withDb<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: any[]) => {
    initDb(getDbPath());
    return fn(...args);
  }) as T;
}
