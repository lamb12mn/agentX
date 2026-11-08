import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Command } from 'commander';
import { initDb, closeDb } from '../../src/store/db.js';
import { createAsset } from '../../src/store/assets.js';
import { createVersionSnapshot } from '../../src/store/versions.js';
import { registerEvaluationCommand } from '../../src/cli/commands/evaluations.js';

// The CLI helpers re-open the DB on every invocation. That is fine for a real
// one-shot CLI process, but would leak handles across the many invocations in
// this suite; the test owns the connection instead.
vi.mock('../../src/cli/common.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/common.js')>();
  return { ...actual, withDb: (fn: (...args: unknown[]) => unknown) => fn };
});

describe('CLI evaluation commands', () => {
  let tmpDir: string;
  let previousDir: string | undefined;
  let previousExitCode: number | string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-cli-evaluations-'));
    previousDir = process.env.AGENTX_DIR;
    previousExitCode = process.exitCode;
    process.env.AGENTX_DIR = tmpDir;
    initDb(join(tmpDir, 'agentx.db'));
  });

  afterEach(() => {
    closeDb();
    if (previousDir === undefined) delete process.env.AGENTX_DIR;
    else process.env.AGENTX_DIR = previousDir;
    process.exitCode = previousExitCode;
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** Each invocation gets a fresh Command, matching how a real CLI process behaves. */
  async function invoke(args: string[]): Promise<any> {
    const program = new Command();
    registerEvaluationCommand(program);
    program.exitOverride();

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await program.parseAsync(['node', 'agentx', ...args], { from: 'node' });
      const text = log.mock.calls.map(call => String(call[0])).join('\n');
      return text ? JSON.parse(text) : null;
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  }

  async function makeAsset(name = 'cli-eval-prompt') {
    const asset = await createAsset(
      { type: 'prompt', name, tags: [] },
      'Summarise {{topic}}',
      tmpDir,
    );
    const version = await createVersionSnapshot(asset.id);
    return { assetId: asset.id, version };
  }

  it('registers the evaluation group with fourteen tool commands plus snapshot', () => {
    const program = new Command();
    registerEvaluationCommand(program);

    expect(program.commands.map(c => c.name())).toEqual(['evaluation']);
    expect(program.commands[0].commands.map(c => c.name())).toEqual([
      'snapshot', 'create', 'list', 'add-sample', 'add-samples', 'rate',
      'samples', 'summary', 'compare', 'suggest',
      'apply-dsl', 'ai-rate', 'ai-rewrite', 'ai-generate', 'apply-rewrite',
    ]);
  });

  it('applies a rewrite candidate offline through the CLI', async () => {
    const { assetId, version } = await makeAsset('cli-rewrite-prompt');
    const set = await invoke(['evaluation', 'create', assetId, String(version), 'baseline']);
    const file = join(tmpDir, 'candidate.json');
    writeFileSync(file, JSON.stringify({
      rewrittenPrompt: 'Rewrite {{topic}} in three paragraphs',
    }));

    const preview = await invoke([
      'evaluation', 'apply-rewrite', set.id, file, '--dry-run',
    ]);
    expect(preview).toMatchObject({ applied: false, version: null, evaluationSetId: null });

    const applied = await invoke([
      'evaluation', 'apply-rewrite', set.id, file, '--name', 'candidate',
    ]);
    expect(applied).toMatchObject({ applied: true, version: version + 1 });

    const summary = await invoke(['evaluation', 'summary', applied.evaluationSetId]);
    expect(summary).toMatchObject({ version: version + 1, mode: 'score', total: 0 });
  });

  it('applies a local DSL file and honours --dry-run', async () => {
    const { assetId, version } = await makeAsset('cli-dsl-prompt');
    const set = await invoke(['evaluation', 'create', assetId, String(version), 'dsl']);
    await invoke(['evaluation', 'add-sample', set.id, 'Q', 'short']);
    await invoke(['evaluation', 'add-sample', set.id, 'Q', 'a detailed answer about SQLite']);

    const file = join(tmpDir, 'dsl.json');
    writeFileSync(file, JSON.stringify({
      default: { score: 3 },
      rules: [
        { when: 'len(answer) < 20', score: 1, feedback: 'too short' },
        { when: "answer contains 'SQLite'", score: 5 },
      ],
    }));

    const dry = await invoke(['evaluation', 'apply-dsl', set.id, file, '--dry-run']);
    expect(dry).toMatchObject({ evaluated: 2, matched: 2, written: 0, dryRun: true });

    const applied = await invoke(['evaluation', 'apply-dsl', set.id, file]);
    expect(applied.written).toBe(2);
    expect(await invoke(['evaluation', 'summary', set.id])).toMatchObject({ averageScore: 3 });
  });

  it('AI subcommands report a missing provider instead of fabricating output', async () => {
    const { assetId, version } = await makeAsset('cli-ai-prompt');
    const set = await invoke(['evaluation', 'create', assetId, String(version), 'ai']);
    const key = process.env.AGENTX_AI_API_KEY;
    delete process.env.AGENTX_AI_API_KEY;

    expect(await invoke(['evaluation', 'ai-rate', set.id])).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(await invoke(['evaluation', 'ai-rewrite', set.id])).toBeNull();

    if (key !== undefined) process.env.AGENTX_AI_API_KEY = key;
  });

  it('runs the local score-mode loop end to end', async () => {
    const { assetId, version } = await makeAsset();

    const set = await invoke([
      'evaluation', 'create', assetId, String(version), 'baseline',
    ]);
    expect(set).toMatchObject({ name: 'baseline', mode: 'score', version });

    expect(await invoke(['evaluation', 'list', assetId])).toHaveLength(1);

    const sample = await invoke([
      'evaluation', 'add-sample', set.id, 'Summarise {{topic}}', 'A short answer',
      '--variables', JSON.stringify({ topic: 'SQLite' }),
    ]);
    expect(sample.rendered_question).toBe('Summarise {{topic}}'.replace('{{topic}}', 'SQLite'));

    await invoke(['evaluation', 'rate', sample.id, '--score', '2']);

    const summary = await invoke(['evaluation', 'summary', set.id]);
    expect(summary).toMatchObject({ total: 1, rated: 1, averageScore: 2 });

    const report = await invoke(['evaluation', 'suggest', set.id]);
    expect(report.weakSampleCount).toBe(1);
    expect(report.insights.map((i: { code: string }) => i.code)).toContain('weak_samples');
  });

  it('supports batch files, sample filters and cross-version comparison', async () => {
    const asset = await createAsset(
      { type: 'prompt', name: 'cli-iterated', tags: [] }, 'Q', tmpDir,
    );
    const v1 = await invoke(['evaluation', 'snapshot', asset.id]);
    const v2 = await invoke(['evaluation', 'snapshot', asset.id]);
    expect([typeof v1, typeof v2]).toEqual(['number', 'number']);
    const baseline = await invoke(['evaluation', 'create', asset.id, String(v1), 'b']);
    const candidate = await invoke(['evaluation', 'create', asset.id, String(v2), 'c']);

    const file = join(tmpDir, 'samples.json');
    writeFileSync(file, JSON.stringify([
      { answer: 'A1', variables: { n: 1 }, idealAnswer: 'I1' },
      { answer: 'A2', variables: { n: 2 }, idealAnswer: 'I2' },
    ]));
    const batch = await invoke(['evaluation', 'add-samples', baseline.id, 'Q{{n}}', file]);
    expect(batch).toHaveLength(2);
    expect(batch[0].rendered_question).toBe('Q1');

    await invoke(['evaluation', 'rate', batch[0].id, '--score', '2']);
    await invoke(['evaluation', 'rate', batch[1].id, '--score', '4']);

    const low = await invoke(['evaluation', 'samples', baseline.id, '--max-score', '2']);
    expect(low.map((s: { id: string }) => s.id)).toEqual([batch[0].id]);

    const [c1] = await invoke([
      'evaluation', 'add-samples', candidate.id, 'Q', file,
    ]);
    await invoke(['evaluation', 'rate', c1.id, '--score', '5']);

    const comparison = await invoke(['evaluation', 'compare', baseline.id, candidate.id]);
    expect(comparison.improved).toBe(true);
    expect(comparison.averageScoreDelta).toBeGreaterThan(0);
  });

  it('handles GSB verdicts and reports store errors without exiting the process', async () => {
    const { assetId, version } = await makeAsset('cli-gsb-prompt');
    const set = await invoke([
      'evaluation', 'create', assetId, String(version), 'pairwise', '--mode', 'gsb',
    ]);
    const sample = await invoke([
      'evaluation', 'add-sample', set.id, 'Q', 'A1', '--reference', 'R1',
    ]);
    await invoke(['evaluation', 'rate', sample.id, '--gsb', 'bad']);

    const bad = await invoke(['evaluation', 'samples', set.id, '--gsb', 'bad']);
    expect(bad.map((s: { id: string }) => s.id)).toEqual([sample.id]);

    const report = await invoke(['evaluation', 'suggest', set.id]);
    expect(report).toMatchObject({ mode: 'gsb', threshold: null, weakSampleCount: 1 });

    expect(await invoke(['evaluation', 'summary', 'no-such-set'])).toBeNull();
    expect(process.exitCode).toBe(1);
  });
});
