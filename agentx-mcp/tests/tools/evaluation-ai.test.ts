import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/store/db.js';
import { createAsset, readAssetContent } from '../../src/store/assets.js';
import { createVersionSnapshot } from '../../src/store/versions.js';
import { registerEvaluationTools } from '../../src/tools/evaluations.js';
import {
  aiGenerateEvaluationSamples,
  aiRateEvaluationSamples,
  aiRewritePrompt,
  applyPromptRewrite,
} from '../../src/store/evaluation-ai.js';
import { AiProviderNotConfiguredError } from '../../src/ai/provider.js';
import type { AiProvider, AiMessage } from '../../src/ai/provider.js';
import type { EvaluationMode } from '../../src/types.js';

const ORIGINAL_KEY = process.env.AGENTX_AI_API_KEY;

function sequenced(contents: string[]): AiProvider {
  let index = 0;
  return {
    execute: async () => ({ content: contents[Math.min(index++, contents.length - 1)] }),
  };
}

function mockProvider(content: string): AiProvider {
  return { execute: async () => ({ content }) };
}

function capturing(content: string): { provider: AiProvider; calls: AiMessage[][] } {
  const calls: AiMessage[][] = [];
  return {
    provider: {
      execute: async (messages) => {
        calls.push(messages);
        return { content };
      },
    },
    calls,
  };
}

describe('AI-assisted evaluation', () => {
  let tmpDir: string;
  let tools: ReturnType<typeof registerEvaluationTools>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-ai-eval-test-'));
    initDb(join(tmpDir, 'test.db'));
    tools = registerEvaluationTools();
    delete process.env.AGENTX_AI_API_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.AGENTX_AI_API_KEY;
    else process.env.AGENTX_AI_API_KEY = ORIGINAL_KEY;
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function makeSet(mode: EvaluationMode = 'score', content = 'Summarise {{topic}}') {
    const asset = await createAsset({ type: 'prompt', name: 'ai-prompt', tags: [] }, content, tmpDir);
    const version = await createVersionSnapshot(asset.id);
    const set = await tools.create_evaluation_set.handler({
      assetId: asset.id, version, name: 'ai-set', mode,
    });
    return { assetId: asset.id, version, setId: set.id };
  }

  async function addSample(setId: string, answer: string) {
    return tools.add_evaluation_sample.handler({
      setId, question: 'Summarise {{topic}}', answer, variables: { topic: 'SQLite' },
    });
  }

  // ── Provider requirement ────────────────────────────────────────────────

  it('refuses to fabricate ratings or rewrites without a provider', async () => {
    const { setId } = await makeSet();
    await expect(aiRateEvaluationSamples(setId)).rejects.toThrow(AiProviderNotConfiguredError);
    await expect(aiRewritePrompt(setId)).rejects.toThrow(AiProviderNotConfiguredError);
  });

  // ── AI rating ───────────────────────────────────────────────────────────

  it('rates unrated samples in score mode and persists the result', async () => {
    const { setId } = await makeSet();
    await addSample(setId, 'first answer');
    await addSample(setId, 'second answer');

    const result = await aiRateEvaluationSamples(setId, {
      provider: sequenced([
        '{"score":5,"feedback":"excellent"}',
        '```json\n{"score":2,"feedback":"too short"}\n```',
      ]),
    });

    expect(result).toMatchObject({ mode: 'score', evaluated: 2, rated: 2, failed: 0 });
    expect(result.results[0]).toMatchObject({ score: 5, feedback: 'excellent' });
    expect(result.results[1]).toMatchObject({ score: 2 });
    const summary = await tools.evaluation_summary.handler({ setId });
    expect(summary.rated).toBe(2);
    expect(summary.averageScore).toBe(3.5);
  });

  it('skips already rated samples unless overwrite is set', async () => {
    const { setId } = await makeSet();
    const first = await addSample(setId, 'first');
    await addSample(setId, 'second');
    await tools.rate_evaluation_sample.handler({ sampleId: first.id, score: 1 });

    const normal = await aiRateEvaluationSamples(setId, {
      provider: mockProvider('{"score":4}'),
    });
    expect(normal.evaluated).toBe(1);

    const overwrite = await aiRateEvaluationSamples(setId, {
      provider: mockProvider('{"score":4}'), overwrite: true,
    });
    expect(overwrite.evaluated).toBe(2);
    const summary = await tools.evaluation_summary.handler({ setId });
    expect(summary.averageScore).toBe(4);
  });

  it('supports GSB mode verdicts', async () => {
    const { setId } = await makeSet('gsb');
    await addSample(setId, 'better than reference');

    const result = await aiRateEvaluationSamples(setId, {
      provider: mockProvider('{"gsb":"good","feedback":"clearer"}'),
    });
    expect(result.results[0]).toMatchObject({ gsb: 'good' });
    const summary = await tools.evaluation_summary.handler({ setId });
    expect(summary.gsb.good).toBe(1);
  });

  it('isolates invalid AI responses without corrupting other samples', async () => {
    const { setId } = await makeSet();
    await addSample(setId, 'one');
    await addSample(setId, 'two');
    await addSample(setId, 'three');

    const result = await aiRateEvaluationSamples(setId, {
      provider: sequenced([
        '{"score":5}',
        'not json at all',
        '{"score":99}',
      ]),
    });

    expect(result.evaluated).toBe(3);
    expect(result.rated).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.errors[0].error).toMatch(/JSON object/);
    expect(result.errors[1].error).toMatch(/score/);
    const summary = await tools.evaluation_summary.handler({ setId });
    expect(summary.rated).toBe(1);
  });

  it('validates the rating limit', async () => {
    const { setId } = await makeSet();
    await expect(aiRateEvaluationSamples(setId, {
      provider: mockProvider('{"score":3}'), limit: 0,
    })).rejects.toThrow(/limit/);
  });

  // ── AI rewrite ──────────────────────────────────────────────────────────

  it('returns a candidate rewrite from weak samples without touching the asset', async () => {
    const { setId, assetId } = await makeSet('score', 'Summarise {{topic}} briefly');
    const weak = await addSample(setId, 'too short');
    await tools.rate_evaluation_sample.handler({
      sampleId: weak.id, score: 1, feedback: 'needs more detail',
    });

    const { provider, calls } = capturing(
      '{"rewrittenPrompt":"Summarise {{topic}} in three paragraphs","rationale":"addresses short answers"}',
    );
    const result = await aiRewritePrompt(setId, { provider, extraInstructions: 'keep it short' });

    expect(result).toMatchObject({
      assetId,
      currentPrompt: 'Summarise {{topic}} briefly',
      rewrittenPrompt: 'Summarise {{topic}} in three paragraphs',
      rationale: 'addresses short answers',
      weakSampleCount: 1,
      applied: false,
    });
    expect(result.insightCodes).toContain('weak_samples');
    expect(result.weakSampleIds).toContain(weak.id);
    expect(await readAssetContent(assetId)).toBe('Summarise {{topic}} briefly');

    const userPayload = JSON.parse(calls[0][1].content) as Record<string, unknown>;
    expect(userPayload.extraInstructions).toBe('keep it short');
    expect(userPayload.weakSamples).toHaveLength(1);
    expect(userPayload.currentPrompt).toBe('Summarise {{topic}} briefly');
  });

  it('rejects rewrite responses without a rewrittenPrompt', async () => {
    const { setId } = await makeSet();
    await expect(aiRewritePrompt(setId, {
      provider: mockProvider('{"rationale":"no prompt here"}'),
    })).rejects.toThrow(/rewrittenPrompt/);
  });

  // ── Dataset expansion (PromptPilot "AI 批量生成变量") ─────────────────────

  function generatingProvider(): AiProvider {
    return {
      execute: async (messages) => {
        if (messages[0].role === 'system' && messages[0].content.includes('evaluation datasets')) {
          return {
            content: '{"samples":[{"variables":{"topic":"PostgreSQL"}},{"variables":{"topic":"RocksDB"}}]}',
          };
        }
        const user = [...messages].reverse().find(message => message.role === 'user');
        return { content: `answer for ${user?.content ?? ''}` };
      },
    };
  }

  it('refuses to fabricate generated samples without a provider', async () => {
    const { setId } = await makeSet();
    await expect(aiGenerateEvaluationSamples(setId)).rejects.toThrow(AiProviderNotConfiguredError);
    await expect(tools.ai_generate_evaluation_samples.handler({ setId }))
      .rejects.toThrow(AiProviderNotConfiguredError);
  });

  it('expands a dataset from seed samples with rendered questions and model answers', async () => {
    const { setId } = await makeSet('score', 'Summarise {{topic}}');
    await addSample(setId, 'seed answer');

    const result = await aiGenerateEvaluationSamples(setId, {
      provider: generatingProvider(), count: 2,
    });

    expect(result).toMatchObject({
      requested: 2, generated: 2, created: 2, dryRun: false,
      question: 'Summarise {{topic}}', variableKeys: ['topic'],
    });
    expect(result.errors).toEqual([]);
    expect(result.samples[0].renderedQuestion).toBe('Summarise PostgreSQL');
    expect(result.samples[0].answer).toBe('answer for Summarise PostgreSQL');

    const stored = await tools.list_evaluation_samples.handler({ setId });
    expect(stored).toHaveLength(3);
    expect(stored[1].rendered_question).toBe('Summarise PostgreSQL');
    expect(stored[1].score).toBeUndefined();
  });

  it('dryRun previews candidates without writing samples', async () => {
    const { setId } = await makeSet('score', 'Summarise {{topic}}');
    await addSample(setId, 'seed answer');

    const result = await aiGenerateEvaluationSamples(setId, {
      provider: generatingProvider(), count: 2, dryRun: true,
    });

    expect(result.created).toBe(0);
    expect(result.samples).toHaveLength(2);
    const summary = await tools.evaluation_summary.handler({ setId });
    expect(summary.total).toBe(1);
  });

  it('skips variable sets that leave placeholders unresolved or duplicate', async () => {
    const { setId } = await makeSet('score', 'Summarise {{topic}}');
    const result = await aiGenerateEvaluationSamples(setId, {
      provider: mockProvider(
        '{"samples":[{"variables":{"wrong":"x"}},{"variables":{"topic":"SQLite"}},{"variables":{"topic":"SQLite"}}]}',
      ),
      question: 'Summarise {{topic}}',
      count: 3,
      generateAnswers: false,
    });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatch(/unresolved/);
    expect(result.errors[1]).toMatch(/duplicate/);
    expect(result.samples[0].answer).toBe('');
  });

  it('validates count and requires a templated question', async () => {
    const { setId } = await makeSet();
    await expect(aiGenerateEvaluationSamples(setId, {
      provider: mockProvider('{}'), count: 0,
    })).rejects.toThrow(/count/);
    await expect(aiGenerateEvaluationSamples(setId, {
      provider: mockProvider('{}'), question: 'plain question',
    })).rejects.toThrow(/placeholder/);
  });

  // ── Closing the loop: new version + new evaluation set ───────────────────

  it('applies a rewrite candidate offline and binds a fresh evaluation set', async () => {
    const { setId, assetId, version } = await makeSet('score', 'Summarise {{topic}}');
    const rewrittenPrompt = 'Summarise {{topic}} in three paragraphs';

    const result = await applyPromptRewrite(setId, { rewrittenPrompt });

    expect(result).toMatchObject({
      assetId, previousVersion: version, version: version + 1, applied: true,
    });
    expect(await readAssetContent(assetId)).toBe(rewrittenPrompt);
    expect(result.evaluationSetId).toBeTruthy();
    const sets = await tools.list_evaluation_sets.handler({ assetId, version: version + 1 });
    expect(sets).toHaveLength(1);
    expect(sets[0].id).toBe(result.evaluationSetId);
  });

  it('previewing a rewrite never touches the asset or versions', async () => {
    const { setId, assetId } = await makeSet('score', 'Summarise {{topic}}');
    const result = await tools.apply_prompt_rewrite.handler({
      setId, rewrittenPrompt: 'new prompt', dryRun: true,
    });

    expect(result).toMatchObject({ applied: false, version: null, evaluationSetId: null });
    expect(await readAssetContent(assetId)).toBe('Summarise {{topic}}');
  });

  it('requires a provider when no rewrite candidate is supplied', async () => {
    const { setId } = await makeSet();
    await expect(applyPromptRewrite(setId)).rejects.toThrow(AiProviderNotConfiguredError);
  });

  it('registers fourteen evaluation tools including the new loop steps', () => {
    const names = Object.keys(tools);
    expect(names).toHaveLength(14);
    expect(names).toContain('ai_rate_evaluation_samples');
    expect(names).toContain('ai_rewrite_prompt');
    expect(names).toContain('ai_generate_evaluation_samples');
    expect(names).toContain('apply_prompt_rewrite');
    expect(tools.ai_rate_evaluation_samples.inputSchema.required).toEqual(['setId']);
  });
});
