/**
 * Optional AI-assisted prompt evaluation.
 *
 * These functions require a real AiProvider (injected explicitly, or built from
 * AGENTX_AI_* environment variables). They never fall back to a stub: without
 * a provider they throw AiProviderNotConfiguredError, so a local-only install
 * cannot silently produce fake ratings.
 *
 * `aiRewritePrompt` returns a candidate prompt string but never writes it back
 * to the asset — applying it stays an explicit caller decision.
 */
import { requireAiProvider } from '../ai/provider.js';
import type { AiProvider } from '../ai/provider.js';
import {
  getEvaluationSummary,
  listEvaluationSamples,
  rateEvaluationSample,
  suggestEvaluationImprovements,
} from './evaluations.js';
import { readAssetContent } from './assets.js';
import type { EvaluationSample } from './evaluations.js';
import type { EvaluationMode, GsbVerdict } from '../types.js';

export interface AiRateOptions {
  /** Inject a provider explicitly; otherwise resolved from the environment. */
  provider?: AiProvider;
  /** Maximum samples to rate (1-100, default 20). */
  limit?: number;
  /** Also re-rate samples that already have a rating. */
  overwrite?: boolean;
  model?: string;
  timeout?: number;
}

export interface AiRating {
  score?: number;
  gsb?: GsbVerdict;
  feedback?: string;
}

export interface AiRateResult {
  setId: string;
  mode: EvaluationMode;
  evaluated: number;
  rated: number;
  failed: number;
  results: Array<AiRating & { sampleId: string }>;
  errors: Array<{ sampleId: string; error: string }>;
}

export interface AiRewriteOptions {
  provider?: AiProvider;
  /** Score-mode low-score threshold (default 2); not supported in GSB mode. */
  maxScore?: number;
  /** Maximum weak samples to include in the context (default 10). */
  limit?: number;
  model?: string;
  timeout?: number;
  extraInstructions?: string;
}

export interface AiRewriteResult {
  setId: string;
  assetId: string;
  version: number;
  mode: EvaluationMode;
  currentPrompt: string;
  rewrittenPrompt: string;
  rationale: string | null;
  weakSampleCount: number;
  weakSampleIds: string[];
  insightCodes: string[];
  /** Always false: this function never modifies the asset. */
  applied: false;
}

const defaultTimeout = 30_000;

function parseJsonObject(content: string): Record<string, unknown> {
  const cleaned = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('AI response must contain a JSON object');
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error('AI response contained invalid JSON');
  }
}

function ratingSystemPrompt(mode: EvaluationMode): string {
  return mode === 'score'
    ? 'You are a prompt evaluation judge. Rate the answer to the question on an integer scale from 1 (worst) to 5 (best). Reply with ONLY a JSON object: {"score": <1-5>, "feedback": "<brief reason>"}.'
    : 'You are a prompt evaluation judge. Compare the answer against the reference answer and reply with ONLY a JSON object: {"gsb": "good|same|bad", "feedback": "<brief reason>"}.';
}

function extractRating(parsed: Record<string, unknown>, mode: EvaluationMode): AiRating {
  const feedback = typeof parsed.feedback === 'string' ? { feedback: parsed.feedback } : {};
  if (mode === 'score') {
    const score = Number(parsed.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error('AI rating must contain an integer "score" between 1 and 5');
    }
    return { score, ...feedback };
  }
  const gsb = parsed.gsb;
  if (gsb !== 'good' && gsb !== 'same' && gsb !== 'bad') {
    throw new Error('AI rating must contain "gsb" of good, same or bad');
  }
  return { gsb, ...feedback };
}

function ratingUserPayload(sample: EvaluationSample, mode: EvaluationMode): string {
  return JSON.stringify({
    question: sample.rendered_question,
    answer: sample.answer,
    ...(mode === 'score'
      ? { idealAnswer: sample.ideal_answer ?? null }
      : { referenceAnswer: sample.reference_answer ?? null }),
    feedback: sample.feedback ?? null,
    variables: sample.variables,
  }, null, 2);
}

/** Rate samples with an AI provider and persist the validated ratings. */
export async function aiRateEvaluationSamples(
  setId: string,
  options: AiRateOptions = {},
): Promise<AiRateResult> {
  const provider = requireAiProvider(options.provider);
  const { mode } = getEvaluationSummary(setId);

  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('limit must be an integer between 1 and 100');
  }

  const samples = listEvaluationSamples(setId, {
    ...(options.overwrite ? {} : { rated: false }),
    limit,
  });

  const results: AiRateResult['results'] = [];
  const errors: AiRateResult['errors'] = [];

  for (const sample of samples) {
    try {
      const response = await provider.execute(
        [
          { role: 'system', content: ratingSystemPrompt(mode) },
          { role: 'user', content: ratingUserPayload(sample, mode) },
        ],
        { temperature: 0, model: options.model, timeout: options.timeout ?? defaultTimeout },
      );
      const rating = extractRating(parseJsonObject(response.content), mode);
      rateEvaluationSample(sample.id, rating);
      results.push({ sampleId: sample.id, ...rating });
    } catch (error) {
      errors.push({ sampleId: sample.id, error: (error as Error).message });
    }
  }

  return {
    setId,
    mode,
    evaluated: samples.length,
    rated: results.length,
    failed: errors.length,
    results,
    errors,
  };
}

/** Produce (but do not apply) a rewritten prompt from weak samples and insights. */
export async function aiRewritePrompt(
  setId: string,
  options: AiRewriteOptions = {},
): Promise<AiRewriteResult> {
  const provider = requireAiProvider(options.provider);
  const report = suggestEvaluationImprovements(setId, {
    ...(options.maxScore !== undefined ? { maxScore: options.maxScore } : {}),
    limit: options.limit ?? 10,
  });
  const summary = getEvaluationSummary(setId);
  const currentPrompt = await readAssetContent(report.assetId);

  const weakIds = new Set(report.weakSampleIds);
  const weakSamples = listEvaluationSamples(setId, { limit: 1000 })
    .filter(sample => weakIds.has(sample.id))
    .map(sample => ({
      question: sample.rendered_question,
      answer: sample.answer,
      idealAnswer: sample.ideal_answer ?? null,
      referenceAnswer: sample.reference_answer ?? null,
      score: sample.score ?? null,
      gsb: sample.gsb ?? null,
      feedback: sample.feedback ?? null,
    }));

  const response = await provider.execute(
    [
      {
        role: 'system',
        content: 'You are a prompt engineer. Rewrite the given prompt so it addresses the weak evaluation cases. Preserve {{variable}} placeholders. Reply with ONLY a JSON object: {"rewrittenPrompt": "<full new prompt>", "rationale": "<brief explanation>"}.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          currentPrompt,
          mode: report.mode,
          version: report.version,
          summary,
          insightCodes: report.insights.map(insight => insight.code),
          insights: report.insights.map(insight => insight.message),
          weakSampleCount: report.weakSampleCount,
          weakSamples,
          ...(options.extraInstructions ? { extraInstructions: options.extraInstructions } : {}),
        }, null, 2),
      },
    ],
    { temperature: 0.4, model: options.model, timeout: options.timeout ?? defaultTimeout },
  );

  const parsed = parseJsonObject(response.content);
  if (typeof parsed.rewrittenPrompt !== 'string' || !parsed.rewrittenPrompt.trim()) {
    throw new Error('AI response must contain a non-empty "rewrittenPrompt"');
  }

  return {
    setId,
    assetId: report.assetId,
    version: report.version,
    mode: report.mode,
    currentPrompt,
    rewrittenPrompt: parsed.rewrittenPrompt,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : null,
    weakSampleCount: report.weakSampleCount,
    weakSampleIds: report.weakSampleIds,
    insightCodes: report.insights.map(insight => insight.code),
    applied: false,
  };
}
