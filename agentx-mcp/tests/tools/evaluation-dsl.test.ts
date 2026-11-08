import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/store/db.js';
import { createAsset } from '../../src/store/assets.js';
import { createVersionSnapshot } from '../../src/store/versions.js';
import { registerEvaluationTools } from '../../src/tools/evaluations.js';
import { parseCondition, parseExpression, matchesExpression } from '../../src/store/evaluation-dsl.js';
import type { EvaluationMode } from '../../src/types.js';

describe('local scoring DSL', () => {
  let tmpDir: string;
  let tools: ReturnType<typeof registerEvaluationTools>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-dsl-test-'));
    initDb(join(tmpDir, 'test.db'));
    tools = registerEvaluationTools();
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function makeSet(mode: EvaluationMode = 'score'): Promise<string> {
    const asset = await createAsset(
      { type: 'prompt', name: 'dsl-prompt', tags: [] },
      'Summarise {{topic}}',
      tmpDir,
    );
    const version = await createVersionSnapshot(asset.id);
    const set = await tools.create_evaluation_set.handler({
      assetId: asset.id, version, name: 'dsl-set', mode,
    });
    return set.id;
  }

  async function addSample(setId: string, answer: string, variables: Record<string, unknown> = {}) {
    return tools.add_evaluation_sample.handler({
      setId, question: 'Summarise {{topic}}', answer, variables,
    });
  }

  // ── Expression parsing ──────────────────────────────────────────────────

  it('parses quoted values, numbers, len() and and-clauses', () => {
    const clauses = parseExpression(
      "answer contains 'SQLite' and len(answer) >= 40 and variables.topic = 'db'",
    );
    expect(clauses).toEqual([
      { field: 'answer', op: 'contains', value: 'SQLite' },
      { field: 'len(answer)', op: '>=', value: 40 },
      { field: 'variables.topic', op: '=', value: 'db' },
    ]);
  });

  it('rejects unknown fields, malformed clauses and empty conditions', () => {
    expect(() => parseExpression('mystery = 1')).toThrow(/Unknown DSL field/);
    expect(() => parseExpression('answer')).toThrow(/Invalid DSL clause/);
    expect(() => parseExpression('   ')).toThrow(/non-empty/);
  });

  it('evaluates operators against a sample', () => {
    const sample = {
      id: 's', set_id: 'set', question: 'q', variables: { topic: 'SQLite' },
      rendered_question: 'q', answer: 'A long answer about SQLite',
      score: undefined, created_at: 1,
    };
    const check = (expr: string) => matchesExpression(parseExpression(expr), sample);

    expect(check('answer contains SQLite')).toBe(true);
    expect(check('answer !contains Postgres')).toBe(true);
    expect(check('len(answer) > 10')).toBe(true);
    expect(check('len(answer) < 10')).toBe(false);
    expect(check("variables.topic = 'SQLite'")).toBe(true);
    expect(check('rated = false')).toBe(true);
    expect(check('len(ideal_answer) = 0')).toBe(true);
    expect(check('answer = nope')).toBe(false);
  });

  it('parses or-chains, parentheses and and-over-or precedence', () => {
    expect(parseCondition("answer contains 'SQLite' or answer contains 'WAL'")).toEqual({
      kind: 'or',
      children: [
        { kind: 'clause', clause: { field: 'answer', op: 'contains', value: 'SQLite' } },
        { kind: 'clause', clause: { field: 'answer', op: 'contains', value: 'WAL' } },
      ],
    });

    expect(parseCondition('rated = false or score = 5 and len(answer) > 10')).toMatchObject({
      kind: 'or', children: [{ kind: 'clause' }, { kind: 'and' }],
    });
    expect(parseCondition('(rated = false or score = 5) and len(answer) > 10')).toMatchObject({
      kind: 'and', children: [{ kind: 'or' }, { kind: 'clause' }],
    });
  });

  it('keeps quoted values containing spaces and logical words intact', () => {
    expect(parseExpression("answer contains 'SQLite and WAL' and variables.topic = 'or'")).toEqual([
      { field: 'answer', op: 'contains', value: 'SQLite and WAL' },
      { field: 'variables.topic', op: '=', value: 'or' },
    ]);
    const sample = {
      id: 's', set_id: 'set', question: 'q', variables: {},
      rendered_question: 'q', answer: 'SQLite and WAL are both fine',
      score: undefined, created_at: 1,
    };
    expect(matchesExpression(parseCondition("answer contains 'SQLite and WAL'"), sample)).toBe(true);
    expect(matchesExpression(parseCondition("answer contains 'WAL' or answer contains 'MySQL'"), sample)).toBe(true);
  });

  it('rejects malformed boolean conditions', () => {
    expect(() => parseCondition('   ')).toThrow(/non-empty/);
    expect(() => parseCondition('answer = 1 and')).toThrow(/Incomplete/);
    expect(() => parseCondition('(answer = 1')).toThrow(/Unmatched "\("/);
    expect(() => parseCondition('answer = 1)')).toThrow(/Unexpected token/);
    expect(() => parseCondition('answer = 1 or or score = 2')).toThrow(/Unexpected "or"/);
    expect(() => parseCondition("answer contains 'unclosed")).toThrow(/Unterminated quote/);
    expect(() => parseCondition('()')).toThrow(/Unmatched "\)"/);
    expect(() => parseExpression('answer = 1 or answer = 2')).toThrow(/only supports `and` chains/);
  });

  // ── Applying the DSL ────────────────────────────────────────────────────

  it('applies the first matching rule and writes ratings', async () => {
    const setId = await makeSet();
    await addSample(setId, 'short', { topic: 'SQLite' });
    await addSample(setId, 'A detailed explanation of SQLite indexing and WAL mode', { topic: 'SQLite' });

    const result = await tools.apply_evaluation_dsl.handler({
      setId,
      dsl: {
        default: { score: 3 },
        rules: [
          { when: 'len(answer) < 40', score: 1, feedback: 'too short' },
          { when: "answer contains 'SQLite' and len(answer) >= 40", score: 5 },
        ],
      },
    });

    expect(result).toMatchObject({ mode: 'score', evaluated: 2, matched: 2, written: 2, dryRun: false });
    expect(result.decisions[0]).toMatchObject({ ruleIndex: 0, score: 1, feedback: 'too short' });
    expect(result.decisions[1]).toMatchObject({ ruleIndex: 1, score: 5 });
    const summary = await tools.evaluation_summary.handler({ setId });
    expect(summary.averageScore).toBe(3);
    expect(summary.rated).toBe(2);
  });

  it('applies rules combining or and parentheses end to end', async () => {
    const setId = await makeSet();
    await addSample(setId, 'short');
    await addSample(setId, 'A detailed explanation of SQLite indexing and WAL mode');
    await addSample(setId, 'A detailed explanation of Postgres indexing and MVCC mode');

    const result = await tools.apply_evaluation_dsl.handler({
      setId,
      dsl: {
        default: { score: 3 },
        rules: [
          { when: "len(answer) < 40 or answer !contains 'mode'", score: 1 },
          { when: "(answer contains 'SQLite' or answer contains 'Postgres') and len(answer) >= 40", score: 5 },
        ],
      },
    });

    expect(result).toMatchObject({ mode: 'score', evaluated: 3, matched: 3, written: 3 });
    expect(result.decisions.map(d => d.score)).toEqual([1, 5, 5]);
    expect(result.decisions.map(d => d.ruleIndex)).toEqual([0, 1, 1]);
    const summary = await tools.evaluation_summary.handler({ setId });
    expect(summary.averageScore).toBeCloseTo(11 / 3);
  });

  it('uses the default when no rule matches and skips samples without one', async () => {
    const setId = await makeSet();
    await addSample(setId, 'a medium answer');

    const noDefault = await tools.apply_evaluation_dsl.handler({
      setId, dsl: { rules: [{ when: "answer contains 'zzz'", score: 5 }] }, dryRun: true,
    });
    expect(noDefault.matched).toBe(0);

    const withDefault = await tools.apply_evaluation_dsl.handler({
      setId, dsl: { rules: [], default: { score: 3 } }, dryRun: true,
    });
    expect(withDefault.matched).toBe(1);
    expect(withDefault.decisions[0]).toMatchObject({ ruleIndex: null, score: 3 });
  });

  it('dryRun produces decisions without writing ratings', async () => {
    const setId = await makeSet();
    await addSample(setId, 'some answer');

    const result = await tools.apply_evaluation_dsl.handler({
      setId, dsl: { default: { score: 4 }, rules: [] }, dryRun: true,
    });
    expect(result.written).toBe(0);
    expect(result.dryRun).toBe(true);
    const summary = await tools.evaluation_summary.handler({ setId });
    expect(summary.rated).toBe(0);
  });

  it('skips rated samples unless overwrite is set', async () => {
    const setId = await makeSet();
    const first = await addSample(setId, 'first answer');
    await addSample(setId, 'second answer');
    await tools.rate_evaluation_sample.handler({ sampleId: first.id, score: 5 });

    const dsl = { default: { score: 1 }, rules: [] };
    const normal = await tools.apply_evaluation_dsl.handler({ setId, dsl });
    expect(normal.evaluated).toBe(1);
    expect(normal.written).toBe(1);

    const overwrite = await tools.apply_evaluation_dsl.handler({ setId, dsl, overwrite: true });
    expect(overwrite.evaluated).toBe(2);
    expect(overwrite.written).toBe(2);
    const summary = await tools.evaluation_summary.handler({ setId });
    expect(summary.averageScore).toBe(1);
  });

  it('respects the sample limit', async () => {
    const setId = await makeSet();
    await addSample(setId, 'one');
    await addSample(setId, 'two');
    await addSample(setId, 'three');

    const result = await tools.apply_evaluation_dsl.handler({
      setId, dsl: { default: { score: 3 }, rules: [] }, limit: 2,
    });
    expect(result.evaluated).toBe(2);
    expect(result.written).toBe(2);
  });

  it('supports GSB mode verdicts', async () => {
    const setId = await makeSet('gsb');
    await addSample(setId, 'clearly better than the reference');

    const result = await tools.apply_evaluation_dsl.handler({
      setId,
      dsl: {
        default: { gsb: 'same' },
        rules: [{ when: "answer contains 'better'", gsb: 'good' }],
      },
    });
    expect(result.decisions[0]).toMatchObject({ ruleIndex: 0, gsb: 'good' });
    const summary = await tools.evaluation_summary.handler({ setId });
    expect(summary.gsb.good).toBe(1);
  });

  it('validates outcomes, limits, expressions and set ids', async () => {
    const setId = await makeSet();
    await addSample(setId, 'answer');

    await expect(tools.apply_evaluation_dsl.handler({
      setId, dsl: { rules: [{ when: 'len(answer) > 0', gsb: 'good' }] },
    })).rejects.toThrow(/not allowed in score mode/);
    await expect(tools.apply_evaluation_dsl.handler({
      setId, dsl: { rules: [{ when: 'len(answer) > 0', score: 9 }] },
    })).rejects.toThrow(/between 1 and 5/);
    await expect(tools.apply_evaluation_dsl.handler({
      setId, dsl: { rules: [{ when: 'unknown = 1', score: 3 }] },
    })).rejects.toThrow(/Unknown DSL field/);
    await expect(tools.apply_evaluation_dsl.handler({
      setId, dsl: { default: { score: 3 }, rules: [] }, limit: 0,
    })).rejects.toThrow(/limit/);
    const empty = await tools.apply_evaluation_dsl.handler({ setId, dsl: { rules: [] } });
    expect(empty.matched).toBe(0);
    await expect(tools.apply_evaluation_dsl.handler({
      setId: 'missing', dsl: { rules: [] },
    })).rejects.toThrow(/Evaluation set not found/);
  });

  it('registers apply_evaluation_dsl alongside the AI tools', () => {
    expect(Object.keys(tools)).toHaveLength(14);
    expect(tools.apply_evaluation_dsl.inputSchema.required).toEqual(['setId', 'dsl']);
  });
});
