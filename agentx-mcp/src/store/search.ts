import { getDb } from './db.js';
import type { AssetMeta, AssetType, SearchResult } from '../types.js';

export type { SearchResult };

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

export async function searchAssets(
  query: string,
  type?: AssetType,
  limit = 20
): Promise<SearchResult[]> {
  const db = getDb();

  // Use FTS5 with rank for scoring
  const sql = type
    ? `SELECT a.*, fts.rank as fts_rank
       FROM assets_fts fts
       JOIN assets a ON a.id = fts.id
       WHERE assets_fts MATCH ? AND a.type = ?
       ORDER BY fts.rank
       LIMIT ?`
    : `SELECT a.*, fts.rank as fts_rank
       FROM assets_fts fts
       JOIN assets a ON a.id = fts.id
       WHERE assets_fts MATCH ?
       ORDER BY fts.rank
       LIMIT ?`;

  const params = type ? [query, type, limit] : [query, limit];

  let rows: Record<string, unknown>[];
  try {
    rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  } catch {
    // FTS5 query syntax error — return empty
    return [];
  }

  return rows.map(row => ({
    meta: rowToMeta(row),
    score: -(row.fts_rank as number), // rank is negative in FTS5
  }));
}

export async function indexAssetContent(id: string, content: string): Promise<void> {
  const db = getDb();
  db.prepare('UPDATE assets_fts SET content = ? WHERE id = ?').run(content, id);
}
