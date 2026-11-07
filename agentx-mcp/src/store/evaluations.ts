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

/** 批量构建评测集：一个种子提问模板 + 一组变量集，逐条本地渲染 */
export interface BatchAddEvaluationSamplesInput {
  setId: string;
  question: string;
  samples: Array<{
    answer: string;
    variables?: Record<string, unknown>;
    idealAnswer?: string;
    referenceAnswer?: string;
    feedback?: string;
  }>;
}

/** 样本明细过滤条件，用于聚焦低分 / 未评分样本 */
export interface ListEvaluationSamplesOptions {
  rated?: boolean;
  maxScore?: number;
  gsb?: GsbVerdict;
  limit?: number;
}

/** 两个版本评测集的对比结果 */
export interface EvaluationComparison {
  baseline: EvaluationSummary;
  candidate: EvaluationSummary;
  averageScoreDelta: number | null;
  gsbNetDelta: number | null;
  ratedCoverageDelta: number;
  improved: boolean | null;
}

/** 本地规则诊断出的改写建议类型（不调用外部模型） */
export type ImprovementInsightCode =
  | 'weak_samples'
  | 'unrated_samples'
  | 'unresolved_variables'
  | 'missing_reference_answer'
  | 'weak_sample_feedback'
  | 'variable_concentration';

export interface ImprovementInsight {
  code: ImprovementInsightCode;
  message: string;
  sampleIds: string[];
}

/** 改写建议报告：弱样本清单 + 可操作的诊断项 */
export interface ImprovementReport {
  setId: string;
  assetId: string;
  version: number;
  mode: EvaluationMode;
  /** score 模式为低分阈值；GSB 模式为 null */
  threshold: number | null;
  total: number;
  weakSampleCount: number;
  weakSampleIds: string[];
  insights: ImprovementInsight[];
}

export interface SuggestImprovementsOptions {
  /** score 模式低分阈值，默认 2；GSB 模式不支持 */
  maxScore?: number;
  /** weakSampleIds 最大条数，默认 20 */
  limit?: number;
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

function insertSample(input: AddEvaluationSampleInput): EvaluationSample {
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
 * 录入样本；question 中的 {{变量}} 用 variables 渲染为 rendered_question
 * @throws 评测集不存在时抛错
 */
export function addEvaluationSample(input: AddEvaluationSampleInput): EvaluationSample {
  if (!readSet(input.setId)) {
    throw new Error(`Evaluation set not found: ${input.setId}`);
  }
  return insertSample(input);
}

/**
 * 批量构建评测数据集：一个种子提问模板配一组变量集，逐条本地渲染。
 * 单事务写入，任一失败整批回滚。
 * @throws 评测集不存在或样本列表为空时抛错
 */
export function addEvaluationSamples(input: BatchAddEvaluationSamplesInput): EvaluationSample[] {
  if (!readSet(input.setId)) {
    throw new Error(`Evaluation set not found: ${input.setId}`);
  }
  if (input.samples.length === 0) {
    throw new Error('samples must not be empty');
  }

  const insert = getDb().transaction((samples: BatchAddEvaluationSamplesInput['samples']) =>
    samples.map(sample => insertSample({
      setId: input.setId,
      question: input.question,
      answer: sample.answer,
      variables: sample.variables,
      idealAnswer: sample.idealAnswer,
      referenceAnswer: sample.referenceAnswer,
      feedback: sample.feedback,
    })));

  return insert(input.samples);
}

/**
 * 查询样本明细，可只取已评分 / 未评分样本，或聚焦低分、特定 GSB 判定。
 * 默认按录入顺序返回，最多 100 条。
 * @throws 评测集不存在或过滤条件与评测模式冲突时抛错
 */
export function listEvaluationSamples(
  setId: string,
  options: ListEvaluationSamplesOptions = {},
): EvaluationSample[] {
  const set = readSet(setId);
  if (!set) {
    throw new Error(`Evaluation set not found: ${setId}`);
  }
  if (options.maxScore !== undefined && set.mode !== 'score') {
    throw new Error('maxScore is only supported in score mode');
  }
  if (options.gsb !== undefined && set.mode !== 'gsb') {
    throw new Error('gsb filter is only supported in GSB mode');
  }

  const clauses = ['set_id = ?'];
  const params: Array<string | number> = [setId];
  if (options.rated === true) {
    clauses.push(set.mode === 'score' ? 'score IS NOT NULL' : 'gsb IS NOT NULL');
  } else if (options.rated === false) {
    clauses.push(set.mode === 'score' ? 'score IS NULL' : 'gsb IS NULL');
  }
  if (options.maxScore !== undefined) {
    clauses.push('score <= ?');
    params.push(options.maxScore);
  }
  if (options.gsb !== undefined) {
    clauses.push('gsb = ?');
    params.push(options.gsb);
  }

  const limit = options.limit ?? 100;
  params.push(limit);
  const rows = getDb().prepare(
    `SELECT * FROM evaluation_samples WHERE ${clauses.join(' AND ')} ORDER BY created_at ASC, rowid ASC LIMIT ?`
  ).all(...params) as SampleRow[];
  return rows.map(toSample);
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

/** GSB 净胜率：好于参照的比例减去差于参照的比例，取值 [-1, 1]；仅 GSB 模式有意义 */
function gsbNet(summary: EvaluationSummary): number | null {
  if (summary.mode !== 'gsb' || summary.rated === 0) return null;
  return (summary.gsb.good - summary.gsb.bad) / summary.rated;
}

function coverage(summary: EvaluationSummary): number {
  return summary.total === 0 ? 0 : summary.rated / summary.total;
}

/**
 * 对比同一资产的两个评测集（通常为前后两个版本），判断优化是否带来提升。
 * 要求资产与评测模式一致；未产生评分的一侧返回 null 指标，不臆断结论。
 * @throws 评测集不存在、资产不一致或模式不一致时抛错
 */
export function compareEvaluationSets(
  baselineSetId: string,
  candidateSetId: string,
): EvaluationComparison {
  const baselineSet = readSet(baselineSetId);
  const candidateSet = readSet(candidateSetId);
  if (!baselineSet) throw new Error(`Evaluation set not found: ${baselineSetId}`);
  if (!candidateSet) throw new Error(`Evaluation set not found: ${candidateSetId}`);
  if (baselineSet.asset_id !== candidateSet.asset_id) {
    throw new Error('Evaluation sets must belong to the same asset');
  }
  if (baselineSet.mode !== candidateSet.mode) {
    throw new Error('Evaluation sets must use the same mode');
  }

  const baseline = getEvaluationSummary(baselineSetId);
  const candidate = getEvaluationSummary(candidateSetId);
  const averageScoreDelta = baseline.averageScore !== null && candidate.averageScore !== null
    ? candidate.averageScore - baseline.averageScore
    : null;
  const baselineNet = gsbNet(baseline);
  const candidateNet = gsbNet(candidate);
  const gsbNetDelta = baselineNet !== null && candidateNet !== null
    ? candidateNet - baselineNet
    : null;

  const signal = baseline.mode === 'score' ? averageScoreDelta : gsbNetDelta;
  return {
    baseline,
    candidate,
    averageScoreDelta,
    gsbNetDelta,
    ratedCoverageDelta: coverage(candidate) - coverage(baseline),
    improved: signal === null ? null : signal > 0,
  };
}

/**
 * 基于弱样本生成可操作的改写建议：纯本地规则诊断，不调用外部模型。
 * score 模式聚焦 score <= maxScore（默认 2）的样本，GSB 模式聚焦 bad 判定。
 * @throws 评测集不存在或选项非法时抛错
 */
export function suggestEvaluationImprovements(
  setId: string,
  options: SuggestImprovementsOptions = {},
): ImprovementReport {
  const set = readSet(setId);
  if (!set) throw new Error(`Evaluation set not found: ${setId}`);

  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('limit must be a positive integer');
  }
  let threshold: number | null = null;
  if (set.mode === 'score') {
    threshold = options.maxScore ?? 2;
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 5) {
      throw new Error('maxScore must be an integer between 1 and 5');
    }
  } else if (options.maxScore !== undefined) {
    throw new Error('maxScore is only supported in score mode');
  }

  const rows = getDb().prepare(
    'SELECT * FROM evaluation_samples WHERE set_id = ? ORDER BY created_at ASC, rowid ASC'
  ).all(setId) as SampleRow[];
  const samples = rows.map(toSample);
  const isRated = (sample: EvaluationSample) =>
    set.mode === 'score' ? sample.score !== undefined : sample.gsb !== undefined;
  const weak = set.mode === 'score'
    ? samples.filter(s => s.score !== undefined && threshold !== null && s.score <= threshold)
    : samples.filter(s => s.gsb === 'bad');
  const unrated = samples.filter(s => !isRated(s));
  const ids = (list: EvaluationSample[]) => list.map(s => s.id);

  const insights: ImprovementInsight[] = [];
  if (weak.length > 0) {
    insights.push({
      code: 'weak_samples',
      message: set.mode === 'score'
        ? `${weak.length} sample(s) scored <= ${threshold}; add few-shot examples or clarify output constraints for these cases.`
        : `${weak.length} sample(s) rated bad against the reference; compare answer with reference_answer before rewriting.`,
      sampleIds: ids(weak),
    });
  }
  if (unrated.length > 0) {
    insights.push({
      code: 'unrated_samples',
      message: `${unrated.length} sample(s) are still unrated; complete the ratings before drawing conclusions.`,
      sampleIds: ids(unrated),
    });
  }

  const unresolved = weak.filter(s => /\{\{\s*[\w.]+\s*\}\}/.test(s.rendered_question));
  if (unresolved.length > 0) {
    insights.push({
      code: 'unresolved_variables',
      message: `${unresolved.length} weak sample(s) still contain unresolved {{variables}}; supply the missing variable values.`,
      sampleIds: ids(unresolved),
    });
  }

  const missingReference = weak.filter(s =>
    set.mode === 'score' ? !s.ideal_answer : !s.reference_answer);
  if (missingReference.length > 0) {
    insights.push({
      code: 'missing_reference_answer',
      message: `${missingReference.length} weak sample(s) lack an ${set.mode === 'score' ? 'idealAnswer' : 'referenceAnswer'}; add one to make the rewrite target measurable.`,
      sampleIds: ids(missingReference),
    });
  }

  const feedback = [...new Set(weak.map(s => s.feedback).filter((f): f is string => !!f))];
  if (feedback.length > 0) {
    insights.push({
      code: 'weak_sample_feedback',
      message: `Feedback on weak samples: ${feedback.map(f => `"${f}"`).join('; ')}.`,
      sampleIds: ids(weak.filter(s => !!s.feedback)),
    });
  }

  const occurrences = new Map<string, { key: string; value: unknown; ids: string[] }>();
  for (const sample of weak) {
    for (const [key, value] of Object.entries(sample.variables)) {
      const token = `${key}=${JSON.stringify(value)}`;
      const entry = occurrences.get(token) ?? { key, value, ids: [] };
      entry.ids.push(sample.id);
      occurrences.set(token, entry);
    }
  }
  const concentrated = [...occurrences.values()]
    .filter(entry => entry.ids.length >= 2 && entry.ids.length / weak.length >= 0.5)
    .sort((a, b) => b.ids.length - a.ids.length)[0];
  if (concentrated) {
    const shown = JSON.stringify(concentrated.value) ?? String(concentrated.value);
    insights.push({
      code: 'variable_concentration',
      message: `Variable "${concentrated.key}" = ${shown} appears in ${concentrated.ids.length} of ${weak.length} weak samples; consider targeted examples for this case.`,
      sampleIds: concentrated.ids,
    });
  }

  return {
    setId: set.id,
    assetId: set.asset_id,
    version: set.version,
    mode: set.mode,
    threshold,
    total: samples.length,
    weakSampleCount: weak.length,
    weakSampleIds: weak.slice(0, limit).map(s => s.id),
    insights,
  };
}
