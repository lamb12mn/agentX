import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, getDb, closeDb } from '../../src/store/db';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agentx-test-'));
  initDb(join(tmpDir, 'db.sqlite'));
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true });
});

describe('initDb', () => {
  it('creates assets table', () => {
    const db = getDb();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assets'").get();
    expect(row).toBeDefined();
  });

  it('creates assets_fts virtual table', () => {
    const db = getDb();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assets_fts'").get();
    expect(row).toBeDefined();
  });
});
