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

  it('registers the fourteen evaluation tools', () => {
    expect(Object.keys(tools)).toEqual([
      'create_evaluation_set',
      'list_evaluation_sets',
      'add_evaluation_sample',
      'rate_evaluation_sample',
      'evaluation_summary',
      'add_evaluation_samples',
      'list_evaluation_samples',
      'compare_evaluation_sets',
      'suggest_prompt_improvements',
      'apply_evaluation_dsl',
      'ai_rate_evaluation_samples',
      'ai_rewrite_prompt',
      'ai_generate_evaluation_samples',
      'apply_prompt_rewrite',
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

  // ── Batch dataset construction ─────────────────────────────────────────

  it('add_evaluation_samples renders one seed question across variable sets', async () => {
    const { set } = await makeScoreSet();

    const samples = await tools.add_evaluation_samples.handler({
      setId: set.id,
      question: 'Summarise {{topic}} in one line',
      samples: [
        { answer: 'A1', variables: { topic: 'SQLite' } },
        { answer: 'A2', variables: { topic: 'FTS5' }, idealAnswer: 'ideal' },
        { answer: 'A3', variables: {} },
      ],
    });

    expect(samples).toHaveLength(3);
    expect(samples.map(s => s.rendered_question)).toEqual([
      'Summarise SQLite in one line',
      'Summarise FTS5 in one line',
      'Summarise {{topic}} in one line',
    ]);
    expect(samples[1].ideal_answer).toBe('ideal');
    expect((await tools.evaluation_summary.handler({ setId: set.id })).total).toBe(3);
  });

  it('add_evaluation_samples is atomic and rejects empty batches', async () => {
    const { set } = await makeScoreSet();

    await expect(
      tools.add_evaluation_samples.handler({ setId: set.id, question: 'Q', samples: [] }),
    ).rejects.toThrow('samples must not be empty');

    await expect(
      tools.add_evaluation_samples.handler({
        setId: set.id,
        question: 'Q',
        samples: [
          { answer: 'ok', variables: { a: 1 } },
          { answer: null as never, variables: {} },
        ],
      }),
    ).rejects.toThrow();
    expect((await tools.evaluation_summary.handler({ setId: set.id })).total).toBe(0);
  });

  it('add_evaluation_samples rejects an unknown set', async () => {
    await expect(
      tools.add_evaluation_samples.handler({
        setId: 'no-such-set', question: 'Q', samples: [{ answer: 'A' }],
      }),
    ).rejects.toThrow('Evaluation set not found');
  });

  // ── Sample details / weak-case focus ────────────────────────────────────

  async function makeScoredSamples() {
    const { set } = await makeScoreSet();
    const samples = await tools.add_evaluation_samples.handler({
      setId: set.id,
      question: 'Q{{n}}',
      samples: [
        { answer: 'A1', variables: { n: 1 } },
        { answer: 'A2', variables: { n: 2 } },
        { answer: 'A3', variables: { n: 3 } },
        { answer: 'A4', variables: { n: 4 } },
      ],
    });
    await tools.rate_evaluation_sample.handler({ sampleId: samples[0].id, score: 2 });
    await tools.rate_evaluation_sample.handler({ sampleId: samples[1].id, score: 5 });
    await tools.rate_evaluation_sample.handler({ sampleId: samples[2].id, score: 3 });
    return { set, samples };
  }

  it('list_evaluation_samples returns details in insertion order and honours limit', async () => {
    const { set, samples } = await makeScoredSamples();

    const all = await tools.list_evaluation_samples.handler({ setId: set.id });
    expect(all.map(s => s.id)).toEqual(samples.map(s => s.id));
    expect(all[0].score).toBe(2);
    expect((await tools.list_evaluation_samples.handler({ setId: set.id, limit: 2 }))).toHaveLength(2);
  });

  it('filters low-score, rated and unrated samples', async () => {
    const { set, samples } = await makeScoredSamples();

    const low = await tools.list_evaluation_samples.handler({ setId: set.id, maxScore: 3 });
    expect(low.map(s => s.id)).toEqual([samples[0].id, samples[2].id]);

    const rated = await tools.list_evaluation_samples.handler({ setId: set.id, rated: true });
    expect(rated).toHaveLength(3);
    const unrated = await tools.list_evaluation_samples.handler({ setId: set.id, rated: false });
    expect(unrated.map(s => s.id)).toEqual([samples[3].id]);
  });

  it('filters by GSB verdict and rejects mode-mismatched filters', async () => {
    const { assetId, version } = await makeAsset();
    const set = await tools.create_evaluation_set.handler({
      assetId, version, name: 'pairwise', mode: 'gsb',
    });
    const [s1, s2] = await tools.add_evaluation_samples.handler({
      setId: set.id,
      question: 'Q',
      samples: [{ answer: 'A1' }, { answer: 'A2' }],
    });
    await tools.rate_evaluation_sample.handler({ sampleId: s1.id, gsb: 'bad' });
    await tools.rate_evaluation_sample.handler({ sampleId: s2.id, gsb: 'good' });

    expect((await tools.list_evaluation_samples.handler({ setId: set.id, gsb: 'bad' })).map(s => s.id))
      .toEqual([s1.id]);
    await expect(
      tools.list_evaluation_samples.handler({ setId: set.id, maxScore: 3 }),
    ).rejects.toThrow('maxScore is only supported in score mode');

    const scoreSet = (await makeScoreSet()).set;
    await expect(
      tools.list_evaluation_samples.handler({ setId: scoreSet.id, gsb: 'good' }),
    ).rejects.toThrow('gsb filter is only supported in GSB mode');
    await expect(
      tools.list_evaluation_samples.handler({ setId: 'no-such-set' }),
    ).rejects.toThrow('Evaluation set not found');
  });

  // ── Cross-version comparison ────────────────────────────────────────────

  it('compare_evaluation_sets reports score improvement across two versions', async () => {
    const asset = await createAsset({ type: 'prompt', name: 'iterated', tags: [] }, 'Hi', tmpDir);
    const v1 = await createVersionSnapshot(asset.id);
    const v2 = await createVersionSnapshot(asset.id);
    const baseline = await tools.create_evaluation_set.handler({
      assetId: asset.id, version: v1, name: 'baseline', mode: 'score',
    });
    const candidate = await tools.create_evaluation_set.handler({
      assetId: asset.id, version: v2, name: 'candidate', mode: 'score',
    });

    const [b1, b2] = await tools.add_evaluation_samples.handler({
      setId: baseline.id, question: 'Q', samples: [{ answer: 'A' }, { answer: 'B' }],
    });
    await tools.rate_evaluation_sample.handler({ sampleId: b1.id, score: 2 });
    await tools.rate_evaluation_sample.handler({ sampleId: b2.id, score: 4 });
    const [c1, c2] = await tools.add_evaluation_samples.handler({
      setId: candidate.id, question: 'Q', samples: [{ answer: 'A' }, { answer: 'B' }],
    });
    await tools.rate_evaluation_sample.handler({ sampleId: c1.id, score: 4 });
    await tools.rate_evaluation_sample.handler({ sampleId: c2.id, score: 5 });

    const comparison = await tools.compare_evaluation_sets.handler({
      baselineSetId: baseline.id, candidateSetId: candidate.id,
    });
    expect(comparison.baseline.averageScore).toBe(3);
    expect(comparison.candidate.averageScore).toBe(4.5);
    expect(comparison.averageScoreDelta).toBe(1.5);
    expect(comparison.gsbNetDelta).toBeNull();
    expect(comparison.ratedCoverageDelta).toBe(0);
    expect(comparison.improved).toBe(true);
  });

  it('compare_evaluation_sets reports GSB net preference', async () => {
    const asset = await createAsset({ type: 'prompt', name: 'gsb-iterated', tags: [] }, 'Hi', tmpDir);
    const v1 = await createVersionSnapshot(asset.id);
    const v2 = await createVersionSnapshot(asset.id);
    const baseline = await tools.create_evaluation_set.handler({
      assetId: asset.id, version: v1, name: 'b', mode: 'gsb',
    });
    const candidate = await tools.create_evaluation_set.handler({
      assetId: asset.id, version: v2, name: 'c', mode: 'gsb',
    });
    const [b1] = await tools.add_evaluation_samples.handler({
      setId: baseline.id, question: 'Q', samples: [{ answer: 'A' }],
    });
    await tools.rate_evaluation_sample.handler({ sampleId: b1.id, gsb: 'bad' });
    const [c1] = await tools.add_evaluation_samples.handler({
      setId: candidate.id, question: 'Q', samples: [{ answer: 'A' }],
    });
    await tools.rate_evaluation_sample.handler({ sampleId: c1.id, gsb: 'good' });

    const comparison = await tools.compare_evaluation_sets.handler({
      baselineSetId: baseline.id, candidateSetId: candidate.id,
    });
    expect(comparison.averageScoreDelta).toBeNull();
    expect(comparison.gsbNetDelta).toBe(2);
    expect(comparison.improved).toBe(true);
  });

  it('compare_evaluation_sets refuses to guess when a side has no ratings', async () => {
    const { set } = await makeScoreSet();
    const other = await tools.create_evaluation_set.handler({
      assetId: set.asset_id, version: set.version, name: 'empty', mode: 'score',
    });

    const comparison = await tools.compare_evaluation_sets.handler({
      baselineSetId: set.id, candidateSetId: other.id,
    });
    expect(comparison.averageScoreDelta).toBeNull();
    expect(comparison.improved).toBeNull();
  });

  it('compare_evaluation_sets rejects mismatched assets, modes and unknown ids', async () => {
    const first = (await makeScoreSet()).set;
    const second = (await makeScoreSet('another-prompt')).set;
    const gsbSet = await tools.create_evaluation_set.handler({
      assetId: first.asset_id, version: first.version, name: 'g', mode: 'gsb',
    });

    await expect(
      tools.compare_evaluation_sets.handler({ baselineSetId: first.id, candidateSetId: second.id }),
    ).rejects.toThrow('same asset');
    await expect(
      tools.compare_evaluation_sets.handler({ baselineSetId: first.id, candidateSetId: gsbSet.id }),
    ).rejects.toThrow('same mode');
    await expect(
      tools.compare_evaluation_sets.handler({ baselineSetId: first.id, candidateSetId: 'missing' }),
    ).rejects.toThrow('Evaluation set not found');
  });

  // ── Local improvement suggestions ──────────────────────────────────────

  async function makeWeakScoreSet() {
    const { set } = await makeScoreSet();
    const [s1, s2, s3, s4] = await tools.add_evaluation_samples.handler({
      setId: set.id,
      question: 'Summarise {{topic}} in one line',
      samples: [
        { answer: 'A1', variables: { topic: 'SQLite' }, feedback: 'too short' },
        { answer: 'A2', variables: { topic: 'SQLite' }, idealAnswer: 'ideal' },
        { answer: 'A3', variables: { topic: 'FTS5' }, idealAnswer: 'ideal' },
        { answer: 'A4', variables: { topic: 'FTS5' } },
      ],
    });
    await tools.rate_evaluation_sample.handler({ sampleId: s1.id, score: 1 });
    await tools.rate_evaluation_sample.handler({ sampleId: s2.id, score: 2 });
    await tools.rate_evaluation_sample.handler({ sampleId: s3.id, score: 5 });
    return { set, s1, s2, s3, s4 };
  }

  it('diagnoses weak samples with actionable, local-only insights', async () => {
    const { set, s1, s2, s4 } = await makeWeakScoreSet();

    const report = await tools.suggest_prompt_improvements.handler({ setId: set.id });

    expect(report).toMatchObject({
      setId: set.id, mode: 'score', threshold: 2, total: 4, weakSampleCount: 2,
    });
    expect(report.weakSampleIds).toEqual([s1.id, s2.id]);
    expect(report.insights.map(i => i.code)).toEqual([
      'weak_samples',
      'unrated_samples',
      'missing_reference_answer',
      'weak_sample_feedback',
      'variable_concentration',
    ]);
    expect(report.insights.find(i => i.code === 'unrated_samples')?.sampleIds).toEqual([s4.id]);
    expect(report.insights.find(i => i.code === 'missing_reference_answer')?.sampleIds).toEqual([s1.id]);
    expect(report.insights.find(i => i.code === 'weak_sample_feedback')?.message).toContain('too short');
    expect(report.insights.find(i => i.code === 'variable_concentration')?.message).toContain('SQLite');
  });

  it('honours a custom score threshold and limits the returned weak ids', async () => {
    const { set, s1, s2, s3 } = await makeWeakScoreSet();

    const report = await tools.suggest_prompt_improvements.handler({
      setId: set.id, maxScore: 5, limit: 2,
    });

    expect(report.threshold).toBe(5);
    expect(report.weakSampleCount).toBe(3);
    expect(report.weakSampleIds).toEqual([s1.id, s2.id]);
    expect(report.weakSampleIds).not.toContain(s3.id);
  });

  it('flags unresolved {{variables}} in weak samples', async () => {
    const { set } = await makeScoreSet();
    const [weak, strong] = await tools.add_evaluation_samples.handler({
      setId: set.id,
      question: 'Explain {{missing}}',
      samples: [{ answer: 'A1', idealAnswer: 'I1' }, { answer: 'A2', idealAnswer: 'I2' }],
    });
    await tools.rate_evaluation_sample.handler({ sampleId: weak.id, score: 2 });
    await tools.rate_evaluation_sample.handler({ sampleId: strong.id, score: 5 });

    const report = await tools.suggest_prompt_improvements.handler({ setId: set.id });
    const unresolved = report.insights.find(i => i.code === 'unresolved_variables');

    expect(unresolved?.sampleIds).toEqual([weak.id]);
    expect(unresolved?.message).toContain('{{');
  });

  it('uses bad verdicts in GSB mode and rejects score-only options', async () => {
    const { assetId, version } = await makeAsset();
    const set = await tools.create_evaluation_set.handler({
      assetId, version, name: 'pairwise', mode: 'gsb',
    });
    const [bad, good] = await tools.add_evaluation_samples.handler({
      setId: set.id,
      question: 'Q',
      samples: [{ answer: 'A1' }, { answer: 'A2', referenceAnswer: 'R2' }],
    });
    await tools.rate_evaluation_sample.handler({ sampleId: bad.id, gsb: 'bad' });
    await tools.rate_evaluation_sample.handler({ sampleId: good.id, gsb: 'good' });

    const report = await tools.suggest_prompt_improvements.handler({ setId: set.id });

    expect(report.mode).toBe('gsb');
    expect(report.threshold).toBeNull();
    expect(report.weakSampleCount).toBe(1);
    expect(report.weakSampleIds).toEqual([bad.id]);
    expect(report.insights.map(i => i.code)).toContain('weak_samples');
    expect(report.insights.find(i => i.code === 'missing_reference_answer')?.sampleIds)
      .toEqual([bad.id]);
    await expect(
      tools.suggest_prompt_improvements.handler({ setId: set.id, maxScore: 2 }),
    ).rejects.toThrow('maxScore is only supported in score mode');
  });

  it('returns no insights when every sample is rated and none is weak', async () => {
    const { set } = await makeScoreSet();
    const [s1] = await tools.add_evaluation_samples.handler({
      setId: set.id, question: 'Q', samples: [{ answer: 'A1', idealAnswer: 'I1' }],
    });
    await tools.rate_evaluation_sample.handler({ sampleId: s1.id, score: 5 });

    const report = await tools.suggest_prompt_improvements.handler({ setId: set.id });

    expect(report.weakSampleCount).toBe(0);
    expect(report.insights).toEqual([]);
  });

  it('validates thresholds, limits and unknown sets', async () => {
    const { set } = await makeScoreSet();

    for (const maxScore of [0, 6, 2.5]) {
      await expect(
        tools.suggest_prompt_improvements.handler({ setId: set.id, maxScore }),
      ).rejects.toThrow('maxScore must be an integer between 1 and 5');
    }
    await expect(
      tools.suggest_prompt_improvements.handler({ setId: set.id, limit: 0 }),
    ).rejects.toThrow('limit must be a positive integer');
    await expect(
      tools.suggest_prompt_improvements.handler({ setId: 'no-such-set' }),
    ).rejects.toThrow('Evaluation set not found');
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
