/**
 * Prompt 评测存储 — 评测集、样本与评分结果。
 *
 * 对齐「每个版本对应独立评测集」：评测集关联 (asset_id, version)，
 * 版本必须已存在（复用 store/versions.ts 的快照）。
 * 评分支持两种模式：1-5 分评分（score）与 GSB 比较（gsb）。
 */

import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { getVersion } from './versions.js';
import { renderTemplate } from '../orchestrator/template.js';
import type { EvaluationMode, GsbVerdict } from '../types.js';

/** 评测集，隶属于某个资产的某个版本快照 */
export interface EvaluationSet {
  id: string;
  asset_id: string;
  version: number;
  name: string;
  mode: EvaluationMode;
  description?: string;
  created_at: number;
}

/** 评测样本：提问模板 + 变量 + 渲染后提问 + 回答 + 评分结果 */
export interface EvaluationSample {
  id: string;
  set_id: string;
  question: string;
  variables: Record<string, unknown>;
  rendered_question: string;
  answer: string;
  ideal_answer?: string;
  reference_answer?: string;
  score?: number;
  gsb?: GsbVerdict;
  feedback?: string;
  created_at: number;
}

/** 评测集评分汇总 */
export interface EvaluationSummary {
  setId: string;
  assetId: string;
  version: number;
  mode: EvaluationMode;
  total: number;
  rated: number;
  averageScore: number | null;
  gsb: { good: number; same: number; bad: number };
}

export interface CreateEvaluationSetInput {
  assetId: string;
  version: number;
  name: string;
  mode: EvaluationMode;
  description?: string;
}

export interface AddEvaluationSampleInput {
  setId: string;
  question: string;
  answer: string;
  variables?: Record<string, unknown>;
  idealAnswer?: string;
  referenceAnswer?: string;
  feedback?: string;
}

export interface RateEvaluationSampleInput {
  score?: number;
  gsb?: GsbVerdict;
  feedback?: string;
}

interface SetRow {
  id: string;
  asset_id: string;
  version: number;
  name: string;
  mode: string;
  description: string | null;
  created_at: number;
}

interface SampleRow {
  id: string;
  set_id: string;
  question: string;
  variables: string;
  rendered_question: string;
  answer: string;
  ideal_answer: string | null;
  reference_answer: string | null;
  score: number | null;
  gsb: string | null;
  feedback: string | null;
  created_at: number;
}

/** 建表（幂等），由 initDb 调用 */
export function ensureEvaluationTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS evaluation_sets (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_evaluation_sets_asset_version ON evaluation_sets(asset_id, version);

    CREATE TABLE IF NOT EXISTS evaluation_samples (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL,
      question TEXT NOT NULL,
      variables TEXT NOT NULL,
      rendered_question TEXT NOT NULL,
      answer TEXT NOT NULL,
      ideal_answer TEXT,
      reference_answer TEXT,
      score INTEGER,
      gsb TEXT,
      feedback TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (set_id) REFERENCES evaluation_sets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_evaluation_samples_set ON evaluation_samples(set_id);
  `);
}

function toSet(row: SetRow): EvaluationSet {
  return {
    id: row.id,
    asset_id: row.asset_id,
    version: row.version,
    name: row.name,
    mode: row.mode as EvaluationMode,
    description: row.description ?? undefined,
    created_at: row.created_at,
  };
}

function toSample(row: SampleRow): EvaluationSample {
  return {
    id: row.id,
    set_id: row.set_id,
    question: row.question,
    variables: JSON.parse(row.variables) as Record<string, unknown>,
    rendered_question: row.rendered_question,
    answer: row.answer,
    ideal_answer: row.ideal_answer ?? undefined,
    reference_answer: row.reference_answer ?? undefined,
    score: row.score ?? undefined,
    gsb: (row.gsb as GsbVerdict | null) ?? undefined,
    feedback: row.feedback ?? undefined,
    created_at: row.created_at,
  };
}

function readSet(setId: string): EvaluationSet | null {
  const row = getDb().prepare('SELECT * FROM evaluation_sets WHERE id = ?').get(setId) as SetRow | undefined;
  return row ? toSet(row) : null;
}

function readSample(sampleId: string): EvaluationSample | null {
  const row = getDb().prepare('SELECT * FROM evaluation_samples WHERE id = ?').get(sampleId) as SampleRow | undefined;
  return row ? toSample(row) : null;
}

/**
 * 创建评测集
 * @throws 版本不存在或评测模式非法时抛错
 */
export function createEvaluationSet(input: CreateEvaluationSetInput): EvaluationSet {
  if (input.mode !== 'score' && input.mode !== 'gsb') {
    throw new Error(`Invalid evaluation mode: ${input.mode}`);
  }
  if (!getVersion(input.assetId, input.version)) {
    throw new Error(`Version ${input.version} not found for asset ${input.assetId}`);
  }

  const set: EvaluationSet = {
    id: uuidv4(),
    asset_id: input.assetId,
    version: input.version,
    name: input.name,
    mode: input.mode,
    description: input.description,
    created_at: Date.now(),
  };

  getDb().prepare(
    `INSERT INTO evaluation_sets (id, asset_id, version, name, mode, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(set.id, set.asset_id, set.version, set.name, set.mode, set.description ?? null, set.created_at);

  return set;
}

/** 列出资产的评测集，可按版本过滤（按创建时间倒序） */
export function listEvaluationSets(assetId: string, version?: number): EvaluationSet[] {
  const db = getDb();
  const rows = version === undefined
    ? db.prepare('SELECT * FROM evaluation_sets WHERE asset_id = ? ORDER BY created_at DESC').all(assetId) as SetRow[]
    : db.prepare('SELECT * FROM evaluation_sets WHERE asset_id = ? AND version = ? ORDER BY created_at DESC').all(assetId, version) as SetRow[];
  return rows.map(toSet);
}

/**
 * 录入样本；question 中的 {{变量}} 用 variables 渲染为 rendered_question
 * @throws 评测集不存在时抛错
 */
export function addEvaluationSample(input: AddEvaluationSampleInput): EvaluationSample {
  if (!readSet(input.setId)) {
    throw new Error(`Evaluation set not found: ${input.setId}`);
  }

  const variables = input.variables ?? {};
  const sample: EvaluationSample = {
    id: uuidv4(),
    set_id: input.setId,
    question: input.question,
    variables,
    rendered_question: renderTemplate(input.question, variables),
    answer: input.answer,
    ideal_answer: input.idealAnswer,
    reference_answer: input.referenceAnswer,
    feedback: input.feedback,
    created_at: Date.now(),
  };

  getDb().prepare(
    `INSERT INTO evaluation_samples
       (id, set_id, question, variables, rendered_question, answer, ideal_answer, reference_answer, feedback, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sample.id, sample.set_id, sample.question, JSON.stringify(variables),
    sample.rendered_question, sample.answer,
    sample.ideal_answer ?? null, sample.reference_answer ?? null,
    sample.feedback ?? null, sample.created_at,
  );

  return sample;
}

/**
 * 为样本评分；评分方式必须与评测集模式一致
 * @throws 样本不存在或评分不符合模式时抛错
 */
export function rateEvaluationSample(sampleId: string, input: RateEvaluationSampleInput): EvaluationSample {
  const sample = readSample(sampleId);
  if (!sample) {
    throw new Error(`Evaluation sample not found: ${sampleId}`);
  }
  const set = readSet(sample.set_id)!;

  if (set.mode === 'score') {
    if (input.gsb !== undefined) throw new Error('GSB verdict is not allowed in score mode');
    if (input.score === undefined || !Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
      throw new Error('Score must be an integer between 1 and 5');
    }
  } else {
    if (input.score !== undefined) throw new Error('Numeric score is not allowed in GSB mode');
    if (input.gsb !== 'good' && input.gsb !== 'same' && input.gsb !== 'bad') {
      throw new Error("GSB verdict must be 'good', 'same' or 'bad'");
    }
  }

  getDb().prepare('UPDATE evaluation_samples SET score = ?, gsb = ?, feedback = ? WHERE id = ?')
    .run(input.score ?? null, input.gsb ?? null, input.feedback ?? sample.feedback ?? null, sampleId);

  return readSample(sampleId)!;
}

/**
 * 汇总评分：样本总数、已评分数、平均分（score 模式）与 GSB 分布（gsb 模式）
 * @throws 评测集不存在时抛错
 */
export function getEvaluationSummary(setId: string): EvaluationSummary {
  const set = readSet(setId);
  if (!set) {
    throw new Error(`Evaluation set not found: ${setId}`);
  }

  const rows = getDb().prepare('SELECT score, gsb FROM evaluation_samples WHERE set_id = ?').all(setId) as
    Array<{ score: number | null; gsb: string | null }>;

  const scores = rows.map(r => r.score).filter((s): s is number => s !== null);
  const gsb = { good: 0, same: 0, bad: 0 };
  for (const row of rows) {
    if (row.gsb === 'good' || row.gsb === 'same' || row.gsb === 'bad') gsb[row.gsb]++;
  }

  return {
    setId: set.id,
    assetId: set.asset_id,
    version: set.version,
    mode: set.mode,
    total: rows.length,
    rated: set.mode === 'score' ? scores.length : gsb.good + gsb.same + gsb.bad,
    averageScore: set.mode === 'score' && scores.length > 0
      ? scores.reduce((sum, s) => sum + s, 0) / scores.length
      : null,
    gsb,
  };
}
