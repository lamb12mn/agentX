import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/store/db.js';
import { createAsset } from '../../src/store/assets.js';
import { createVersionSnapshot } from '../../src/store/versions.js';
import { registerEvaluationTools } from '../../src/tools/evaluations.js';

describe('evaluation tools', () => {
  let tmpDir: string;
  let tools: ReturnType<typeof registerEvaluationTools>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-evaluations-test-'));
    initDb(join(tmpDir, 'test.db'));
    tools = registerEvaluationTools();
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Create a prompt asset plus its first version snapshot. */
  async function makeAsset(name = 'prompt-under-test'): Promise<{ assetId: string; version: number }> {
    const asset = await createAsset(
      { type: 'prompt', name, tags: [] },
      'Summarise {{topic}}',
      tmpDir,
    );
    const version = await createVersionSnapshot(asset.id);
    return { assetId: asset.id, version };
  }

  async function makeScoreSet() {
    const { assetId, version } = await makeAsset();
    const set = await tools.create_evaluation_set.handler({
      assetId, version, name: 'baseline', mode: 'score',
    });
    return { assetId, version, set };
  }

  // ── Tool surface ────────────────────────────────────────────────────────

  it('registers the five evaluation tools', () => {
    expect(Object.keys(tools)).toEqual([
      'create_evaluation_set',
      'list_evaluation_sets',
      'add_evaluation_sample',
      'rate_evaluation_sample',
      'evaluation_summary',
    ]);
  });

  // ── Evaluation sets & version binding ──────────────────────────────────

  it('create_evaluation_set binds a set to an existing version snapshot', async () => {
    const { assetId, version } = await makeAsset();

    const set = await tools.create_evaluation_set.handler({
      assetId, version, name: 'baseline', mode: 'score', description: 'first pass',
    });

    expect(set.id).toBeTruthy();
    expect(set.asset_id).toBe(assetId);
    expect(set.version).toBe(version);
    expect(set.name).toBe('baseline');
    expect(set.mode).toBe('score');
    expect(set.description).toBe('first pass');
    expect(set.created_at).toBeTruthy();
  });

  it('rejects an evaluation set for a version that does not exist', async () => {
    const { assetId } = await makeAsset();

    await expect(
      tools.create_evaluation_set.handler({ assetId, version: 999, name: 'orphan', mode: 'score' }),
    ).rejects.toThrow('Version 999 not found');
  });

  it('rejects an unsupported evaluation mode', async () => {
    const { assetId, version } = await makeAsset();

    await expect(
      tools.create_evaluation_set.handler({ assetId, version, name: 'bad', mode: 'invalid' as never }),
    ).rejects.toThrow('Invalid evaluation mode');
  });

  it('list_evaluation_sets filters by version and keeps versions independent', async () => {
    const asset = await createAsset({ type: 'prompt', name: 'multi-version', tags: [] }, 'Hi', tmpDir);
    const v1 = await createVersionSnapshot(asset.id);
    const v2 = await createVersionSnapshot(asset.id);

    await tools.create_evaluation_set.handler({ assetId: asset.id, version: v1, name: 'v1-score', mode: 'score' });
    await tools.create_evaluation_set.handler({ assetId: asset.id, version: v1, name: 'v1-gsb', mode: 'gsb' });
    await tools.create_evaluation_set.handler({ assetId: asset.id, version: v2, name: 'v2-score', mode: 'score' });

    const v1Sets = await tools.list_evaluation_sets.handler({ assetId: asset.id, version: v1 });
    expect(v1Sets).toHaveLength(2);
    expect(v1Sets.every(s => s.version === v1)).toBe(true);

    const allSets = await tools.list_evaluation_sets.handler({ assetId: asset.id });
    expect(allSets).toHaveLength(3);
  });

  // ── Samples ─────────────────────────────────────────────────────────────

  it('add_evaluation_sample renders {{variables}} and stores reference answers', async () => {
    const { set } = await makeScoreSet();

    const sample = await tools.add_evaluation_sample.handler({
      setId: set.id,
      question: 'Summarise {{topic}} in one line',
      answer: 'A short summary',
      variables: { topic: 'SQLite' },
      idealAnswer: 'The ideal one-liner',
      feedback: 'concise',
    });

    expect(sample.set_id).toBe(set.id);
    expect(sample.question).toBe('Summarise {{topic}} in one line');
    expect(sample.variables).toEqual({ topic: 'SQLite' });
    expect(sample.rendered_question).toBe('Summarise SQLite in one line');
    expect(sample.answer).toBe('A short summary');
    expect(sample.ideal_answer).toBe('The ideal one-liner');
    expect(sample.feedback).toBe('concise');
    expect(sample.score).toBeUndefined();
    expect(sample.gsb).toBeUndefined();
  });

  it('keeps unresolved {{variables}} visible in rendered_question', async () => {
    const { set } = await makeScoreSet();

    const sample = await tools.add_evaluation_sample.handler({
      setId: set.id, question: 'Explain {{missing}}', answer: 'N/A', variables: {},
    });

    expect(sample.rendered_question).toBe('Explain {{missing}}');
  });

  it('rejects a sample for an unknown evaluation set', async () => {
    await expect(
      tools.add_evaluation_sample.handler({ setId: 'no-such-set', question: 'Q', answer: 'A' }),
    ).rejects.toThrow('Evaluation set not found');
  });

  // ── Score mode ──────────────────────────────────────────────────────────

  it('rates samples 1-5 and summarises total, rated and average score', async () => {
    const { assetId, version, set } = await makeScoreSet();
    const s1 = await tools.add_evaluation_sample.handler({ setId: set.id, question: 'Q1', answer: 'A1' });
    const s2 = await tools.add_evaluation_sample.handler({ setId: set.id, question: 'Q2', answer: 'A2' });
    await tools.add_evaluation_sample.handler({ setId: set.id, question: 'Q3', answer: 'A3' });

    await tools.rate_evaluation_sample.handler({ sampleId: s1.id, score: 5 });
    await tools.rate_evaluation_sample.handler({ sampleId: s2.id, score: 3 });

    const summary = await tools.evaluation_summary.handler({ setId: set.id });
    expect(summary).toEqual({
      setId: set.id,
      assetId,
      version,
      mode: 'score',
      total: 3,
      rated: 2,
      averageScore: 4,
      gsb: { good: 0, same: 0, bad: 0 },
    });
  });

  it('an empty set summarises to zeroes and a null average', async () => {
    const { set } = await makeScoreSet();

    const summary = await tools.evaluation_summary.handler({ setId: set.id });

    expect(summary.total).toBe(0);
    expect(summary.rated).toBe(0);
    expect(summary.averageScore).toBeNull();
    expect(summary.gsb).toEqual({ good: 0, same: 0, bad: 0 });
  });

  it('rejects scores outside 1-5 and non-integer scores', async () => {
    const { set } = await makeScoreSet();
    const sample = await tools.add_evaluation_sample.handler({ setId: set.id, question: 'Q', answer: 'A' });

    for (const score of [0, 6, 2.5]) {
      await expect(
        tools.rate_evaluation_sample.handler({ sampleId: sample.id, score }),
      ).rejects.toThrow('Score must be an integer between 1 and 5');
    }
    await expect(
      tools.rate_evaluation_sample.handler({ sampleId: sample.id }),
    ).rejects.toThrow('Score must be an integer between 1 and 5');
  });

  it('rejects a GSB verdict in score mode', async () => {
    const { set } = await makeScoreSet();
    const sample = await tools.add_evaluation_sample.handler({ setId: set.id, question: 'Q', answer: 'A' });

    await expect(
      tools.rate_evaluation_sample.handler({ sampleId: sample.id, gsb: 'good' }),
    ).rejects.toThrow('GSB verdict is not allowed in score mode');
  });

  it('re-rating overwrites the score but keeps existing feedback', async () => {
    const { set } = await makeScoreSet();
    const sample = await tools.add_evaluation_sample.handler({ setId: set.id, question: 'Q', answer: 'A' });

    await tools.rate_evaluation_sample.handler({ sampleId: sample.id, score: 2, feedback: 'too short' });
    const updated = await tools.rate_evaluation_sample.handler({ sampleId: sample.id, score: 5 });

    expect(updated.score).toBe(5);
    expect(updated.feedback).toBe('too short');
    expect((await tools.evaluation_summary.handler({ setId: set.id })).averageScore).toBe(5);
  });

  // ── GSB mode ────────────────────────────────────────────────────────────

  it('records GSB verdicts and reports their distribution', async () => {
    const { assetId, version } = await makeAsset();
    const set = await tools.create_evaluation_set.handler({
      assetId, version, name: 'pairwise', mode: 'gsb',
    });
    const s1 = await tools.add_evaluation_sample.handler({
      setId: set.id, question: 'Q1', answer: 'A1', referenceAnswer: 'R1',
    });
    const s2 = await tools.add_evaluation_sample.handler({ setId: set.id, question: 'Q2', answer: 'A2' });
    const s3 = await tools.add_evaluation_sample.handler({ setId: set.id, question: 'Q3', answer: 'A3' });
    await tools.add_evaluation_sample.handler({ setId: set.id, question: 'Q4', answer: 'A4' });

    await tools.rate_evaluation_sample.handler({ sampleId: s1.id, gsb: 'good' });
    await tools.rate_evaluation_sample.handler({ sampleId: s2.id, gsb: 'same' });
    await tools.rate_evaluation_sample.handler({ sampleId: s3.id, gsb: 'bad' });

    const summary = await tools.evaluation_summary.handler({ setId: set.id });
    expect(summary.mode).toBe('gsb');
    expect(summary.total).toBe(4);
    expect(summary.rated).toBe(3);
    expect(summary.averageScore).toBeNull();
    expect(summary.gsb).toEqual({ good: 1, same: 1, bad: 1 });
  });

  it('rejects a numeric score and invalid verdicts in GSB mode', async () => {
    const { assetId, version } = await makeAsset();
    const set = await tools.create_evaluation_set.handler({
      assetId, version, name: 'pairwise', mode: 'gsb',
    });
    const sample = await tools.add_evaluation_sample.handler({ setId: set.id, question: 'Q', answer: 'A' });

    await expect(
      tools.rate_evaluation_sample.handler({ sampleId: sample.id, score: 4 }),
    ).rejects.toThrow('Numeric score is not allowed in GSB mode');
    await expect(
      tools.rate_evaluation_sample.handler({ sampleId: sample.id, gsb: 'excellent' as never }),
    ).rejects.toThrow("GSB verdict must be 'good', 'same' or 'bad'");
  });

  // ── Error boundaries ────────────────────────────────────────────────────

  it('rejects rating or summarising unknown ids', async () => {
    await expect(
      tools.rate_evaluation_sample.handler({ sampleId: 'no-such-sample', score: 3 }),
    ).rejects.toThrow('Evaluation sample not found');
    await expect(
      tools.evaluation_summary.handler({ setId: 'no-such-set' }),
    ).rejects.toThrow('Evaluation set not found');
  });
});
