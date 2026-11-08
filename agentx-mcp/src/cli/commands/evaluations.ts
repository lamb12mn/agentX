/**
 * CLI evaluation command group — the local prompt evaluation loop.
 *
 * Mirrors the fourteen MCP tools in src/tools/evaluations.ts one-to-one:
 *   create / list / add-sample / add-samples / rate / samples / summary /
 *   compare / suggest / apply-dsl / ai-rate / ai-rewrite / ai-generate /
 *   apply-rewrite
 * Plus `snapshot`, the CLI-only prerequisite for creating a version snapshot.
 * `ai-rate` / `ai-rewrite` / `ai-generate` need AGENTX_AI_API_KEY;
 * `apply-rewrite` is offline when a candidate is supplied.
 *
 * All commands print JSON and never call process.exit(), so they stay
 * testable and composable in scripts.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { withDb } from '../common.js';
import {
  createEvaluationSet,
  listEvaluationSets,
  addEvaluationSample,
  addEvaluationSamples,
  listEvaluationSamples,
  rateEvaluationSample,
  getEvaluationSummary,
  compareEvaluationSets,
  suggestEvaluationImprovements,
} from '../../store/evaluations.js';
import type {
  BatchAddEvaluationSamplesInput,
  ListEvaluationSamplesOptions,
} from '../../store/evaluations.js';
import { applyEvaluationDsl } from '../../store/evaluation-dsl.js';
import type { EvaluationDsl } from '../../store/evaluation-dsl.js';
import {
  aiGenerateEvaluationSamples,
  aiRateEvaluationSamples,
  aiRewritePrompt,
  applyPromptRewrite,
} from '../../store/evaluation-ai.js';
import { createVersionSnapshot } from '../../store/versions.js';
import type { EvaluationMode, GsbVerdict } from '../../types.js';

function parseJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`${label} must be valid JSON: ${(e as Error).message}`);
  }
}

function intOption(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value;
}

function optionalInt(raw: string | undefined, label: string): number | undefined {
  return raw === undefined ? undefined : intOption(raw, label);
}

/** Initialise the DB once, print the result as JSON, and surface store errors. */
function run<T>(fn: () => T | Promise<T>): Promise<void> {
  return withDb(async () => {
    try {
      console.log(JSON.stringify(await fn(), null, 2));
    } catch (e) {
      console.error(chalk.red('✗'), (e as Error).message);
      process.exitCode = 1;
    }
  })();
}

export function registerEvaluationCommand(program: Command): void {
  const evaluation = program
    .command('evaluation')
    .description('Local prompt evaluation sets, samples and improvement suggestions');

  evaluation
    .command('snapshot <assetId>')
    .description('Create the version snapshot required by evaluation create')
    .action((assetId: string) => run(() => createVersionSnapshot(assetId)));

  evaluation
    .command('create <assetId> <version> <name>')
    .description('Create an evaluation set bound to a version snapshot')
    .option('-m, --mode <mode>', 'score (default) or gsb', 'score')
    .option('-d, --description <text>', 'Optional description')
    .action((assetId: string, version: string, name: string, opts: { mode: string; description?: string }) =>
      run(() => createEvaluationSet({
        assetId,
        version: intOption(version, 'version'),
        name,
        mode: opts.mode as EvaluationMode,
        description: opts.description,
      })));

  evaluation
    .command('list <assetId>')
    .description('List evaluation sets for an asset')
    .option('--version <n>', 'Filter by version snapshot')
    .action((assetId: string, opts: { version?: string }) =>
      run(() => listEvaluationSets(assetId, optionalInt(opts.version, '--version'))));

  evaluation
    .command('add-sample <setId> <question> <answer>')
    .description('Add one sample; {{variables}} are rendered locally')
    .option('--variables <json>', 'JSON object of template variables')
    .option('--ideal <text>', 'Ideal answer (score mode)')
    .option('--reference <text>', 'Reference answer (GSB mode)')
    .option('--feedback <text>', 'Free-form feedback')
    .action((
      setId: string, question: string, answer: string,
      opts: { variables?: string; ideal?: string; reference?: string; feedback?: string },
    ) => run(() => addEvaluationSample({
      setId,
      question,
      answer,
      variables: opts.variables
        ? parseJson<Record<string, unknown>>(opts.variables, '--variables')
        : undefined,
      idealAnswer: opts.ideal,
      referenceAnswer: opts.reference,
      feedback: opts.feedback,
    })));

  evaluation
    .command('add-samples <setId> <question> <file>')
    .description('Build a dataset from a seed question and a JSON array of samples')
    .action((setId: string, question: string, file: string) =>
      run(async () => {
        const samples = parseJson<BatchAddEvaluationSamplesInput['samples']>(
          await readFile(file, 'utf-8'), file,
        );
        if (!Array.isArray(samples)) throw new Error(`${file} must contain a JSON array of samples`);
        return addEvaluationSamples({ setId, question, samples });
      }));

  evaluation
    .command('rate <sampleId>')
    .description('Rate a sample with a 1-5 score or a GSB verdict')
    .option('--score <n>', 'Score from 1 to 5 (score mode)')
    .option('--gsb <verdict>', 'good / same / bad (GSB mode)')
    .option('--feedback <text>', 'Free-form feedback')
    .action((sampleId: string, opts: { score?: string; gsb?: string; feedback?: string }) =>
      run(() => rateEvaluationSample(sampleId, {
        score: optionalInt(opts.score, '--score'),
        gsb: opts.gsb as GsbVerdict | undefined,
        feedback: opts.feedback,
      })));

  evaluation
    .command('samples <setId>')
    .description('List sample details, optionally filtered to weak cases')
    .option('--rated', 'Only rated samples')
    .option('--unrated', 'Only unrated samples')
    .option('--max-score <n>', 'Score mode: samples with score <= n')
    .option('--gsb <verdict>', 'GSB mode: samples with this verdict')
    .option('--limit <n>', 'Maximum samples to return')
    .action((
      setId: string,
      opts: { rated?: boolean; unrated?: boolean; maxScore?: string; gsb?: string; limit?: string },
    ) => run(() => {
      if (opts.rated && opts.unrated) throw new Error('--rated and --unrated are mutually exclusive');
      const options: ListEvaluationSamplesOptions = {
        rated: opts.rated ? true : opts.unrated ? false : undefined,
        maxScore: optionalInt(opts.maxScore, '--max-score'),
        gsb: opts.gsb as GsbVerdict | undefined,
        limit: optionalInt(opts.limit, '--limit'),
      };
      return listEvaluationSamples(setId, options);
    }));

  evaluation
    .command('summary <setId>')
    .description('Summarise ratings for an evaluation set')
    .action((setId: string) => run(() => getEvaluationSummary(setId)));

  evaluation
    .command('compare <baselineSetId> <candidateSetId>')
    .description('Compare two versions of the same asset')
    .action((baselineSetId: string, candidateSetId: string) =>
      run(() => compareEvaluationSets(baselineSetId, candidateSetId)));

  evaluation
    .command('suggest <setId>')
    .description('Rule-based, local-only rewrite suggestions from weak samples')
    .option('--max-score <n>', 'Score mode: low-score threshold (default 2)')
    .option('--limit <n>', 'Maximum weak sample IDs to return')
    .action((setId: string, opts: { maxScore?: string; limit?: string }) =>
      run(() => suggestEvaluationImprovements(setId, {
        maxScore: optionalInt(opts.maxScore, '--max-score'),
        limit: optionalInt(opts.limit, '--limit'),
      })));

  evaluation
    .command('apply-dsl <setId> <file>')
    .description('Auto-rate samples with a local rule DSL from a JSON file')
    .option('--dry-run', 'Show decisions without writing ratings')
    .option('--limit <n>', 'Maximum samples to inspect')
    .option('--overwrite', 'Also re-rate already rated samples')
    .action((
      setId: string, file: string,
      opts: { dryRun?: boolean; limit?: string; overwrite?: boolean },
    ) => run(async () => {
      const dsl = parseJson<EvaluationDsl>(await readFile(file, 'utf-8'), file);
      return applyEvaluationDsl(setId, dsl, {
        dryRun: opts.dryRun,
        limit: optionalInt(opts.limit, '--limit'),
        overwrite: opts.overwrite,
      });
    }));

  evaluation
    .command('ai-rate <setId>')
    .description('Rate samples with an AI provider (requires AGENTX_AI_API_KEY)')
    .option('--limit <n>', 'Maximum samples to rate')
    .option('--overwrite', 'Also re-rate already rated samples')
    .option('--model <name>', 'Override the configured model')
    .option('--timeout <ms>', 'Per-sample timeout in ms')
    .action((
      setId: string,
      opts: { limit?: string; overwrite?: boolean; model?: string; timeout?: string },
    ) => run(() => aiRateEvaluationSamples(setId, {
      limit: optionalInt(opts.limit, '--limit'),
      overwrite: opts.overwrite,
      model: opts.model,
      timeout: optionalInt(opts.timeout, '--timeout'),
    })));

  evaluation
    .command('ai-rewrite <setId>')
    .description('Propose a rewritten prompt from weak samples (requires AGENTX_AI_API_KEY)')
    .option('--max-score <n>', 'Score mode: low-score threshold')
    .option('--limit <n>', 'Maximum weak samples for context')
    .option('--model <name>', 'Override the configured model')
    .option('--timeout <ms>', 'Request timeout in ms')
    .option('--instructions <text>', 'Additional rewrite constraints')
    .action((
      setId: string,
      opts: { maxScore?: string; limit?: string; model?: string; timeout?: string; instructions?: string },
    ) => run(() => aiRewritePrompt(setId, {
      maxScore: optionalInt(opts.maxScore, '--max-score'),
      limit: optionalInt(opts.limit, '--limit'),
      model: opts.model,
      timeout: optionalInt(opts.timeout, '--timeout'),
      extraInstructions: opts.instructions,
    })));

  evaluation
    .command('ai-generate <setId>')
    .description('Expand the dataset with AI-generated {{variables}} (requires AGENTX_AI_API_KEY)')
    .option('--count <n>', 'Number of new variable sets (1-20)')
    .option('--question <template>', 'Question template with {{variables}}')
    .option('--no-answers', 'Generate variables only, leave answers empty')
    .option('--dry-run', 'Return candidates without writing samples')
    .option('--model <name>', 'Override the configured model')
    .option('--timeout <ms>', 'Per-request timeout in ms')
    .option('--instructions <text>', 'Extra guidance for variable diversity')
    .action((
      setId: string,
      opts: {
        count?: string; question?: string; answers?: boolean; dryRun?: boolean;
        model?: string; timeout?: string; instructions?: string;
      },
    ) => run(() => aiGenerateEvaluationSamples(setId, {
      count: optionalInt(opts.count, '--count'),
      question: opts.question,
      generateAnswers: opts.answers,
      dryRun: opts.dryRun,
      model: opts.model,
      timeout: optionalInt(opts.timeout, '--timeout'),
      instructions: opts.instructions,
    })));

  evaluation
    .command('apply-rewrite <setId> [file]')
    .description('Apply a rewrite candidate as a new prompt version + evaluation set')
    .option('--rewritten-prompt <text>', 'Candidate prompt text (offline; overrides [file])')
    .option('--dry-run', 'Preview without writing anything')
    .option('--name <name>', 'Name for the new evaluation set')
    .option('--description <text>', 'Description for the new evaluation set')
    .option('--max-score <n>', 'Score mode: low-score threshold')
    .option('--limit <n>', 'Maximum weak samples for context')
    .option('--model <name>', 'Override the configured model')
    .option('--timeout <ms>', 'Request timeout in ms')
    .option('--instructions <text>', 'Additional rewrite constraints')
    .action((
      setId: string, file: string | undefined,
      opts: {
        rewrittenPrompt?: string; dryRun?: boolean; name?: string; description?: string;
        maxScore?: string; limit?: string; model?: string; timeout?: string; instructions?: string;
      },
    ) => run(async () => {
      let rewrittenPrompt = opts.rewrittenPrompt;
      if (rewrittenPrompt === undefined && file) {
        const candidate = parseJson<{ rewrittenPrompt?: string }>(await readFile(file, 'utf-8'), file);
        rewrittenPrompt = candidate.rewrittenPrompt;
      }
      if (rewrittenPrompt !== undefined && !rewrittenPrompt.trim()) {
        throw new Error('rewrittenPrompt must not be empty');
      }
      return applyPromptRewrite(setId, {
        ...(rewrittenPrompt !== undefined ? { rewrittenPrompt } : {}),
        dryRun: opts.dryRun,
        name: opts.name,
        description: opts.description,
        maxScore: optionalInt(opts.maxScore, '--max-score'),
        limit: optionalInt(opts.limit, '--limit'),
        model: opts.model,
        timeout: optionalInt(opts.timeout, '--timeout'),
        extraInstructions: opts.instructions,
      });
    }));
}
