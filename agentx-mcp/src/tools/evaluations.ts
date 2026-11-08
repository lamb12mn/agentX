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
} from '../store/evaluations.js';
import type {
  EvaluationSet,
  EvaluationSample,
  EvaluationSummary,
  EvaluationComparison,
  ImprovementReport,
} from '../store/evaluations.js';
import { applyEvaluationDsl } from '../store/evaluation-dsl.js';
import type {
  EvaluationDsl,
  DslApplicationResult,
} from '../store/evaluation-dsl.js';
import {
  aiGenerateEvaluationSamples,
  aiRateEvaluationSamples,
  aiRewritePrompt,
  applyPromptRewrite,
} from '../store/evaluation-ai.js';
import type {
  AiGenerateSamplesResult,
  AiRateResult,
  AiRewriteResult,
  ApplyRewriteResult,
} from '../store/evaluation-ai.js';
import type { ToolHandler } from './common.js';
import type { EvaluationMode, GsbVerdict } from '../types.js';

/**
 * Register prompt evaluation MCP tools
 * (evaluation sets, samples, ratings and score summaries).
 * Sets are bound to an existing asset version snapshot; ratings are local-only.
 * @returns Evaluation tool handlers map
 */
export function registerEvaluationTools(): {
  create_evaluation_set: ToolHandler<{
    assetId: string;
    version: number;
    name: string;
    mode: EvaluationMode;
    description?: string;
  }, EvaluationSet>;
  list_evaluation_sets: ToolHandler<{
    assetId: string;
    version?: number;
  }, EvaluationSet[]>;
  add_evaluation_sample: ToolHandler<{
    setId: string;
    question: string;
    answer: string;
    variables?: Record<string, unknown>;
    idealAnswer?: string;
    referenceAnswer?: string;
    feedback?: string;
  }, EvaluationSample>;
  rate_evaluation_sample: ToolHandler<{
    sampleId: string;
    score?: number;
    gsb?: GsbVerdict;
    feedback?: string;
  }, EvaluationSample>;
  evaluation_summary: ToolHandler<{ setId: string }, EvaluationSummary>;
  add_evaluation_samples: ToolHandler<{
    setId: string;
    question: string;
    samples: Array<{
      answer: string;
      variables?: Record<string, unknown>;
      idealAnswer?: string;
      referenceAnswer?: string;
      feedback?: string;
    }>;
  }, EvaluationSample[]>;
  list_evaluation_samples: ToolHandler<{
    setId: string;
    rated?: boolean;
    maxScore?: number;
    gsb?: GsbVerdict;
    limit?: number;
  }, EvaluationSample[]>;
  compare_evaluation_sets: ToolHandler<{
    baselineSetId: string;
    candidateSetId: string;
  }, EvaluationComparison>;
  suggest_prompt_improvements: ToolHandler<{
    setId: string;
    maxScore?: number;
    limit?: number;
  }, ImprovementReport>;
  apply_evaluation_dsl: ToolHandler<{
    setId: string;
    dsl: EvaluationDsl;
    dryRun?: boolean;
    limit?: number;
    overwrite?: boolean;
  }, DslApplicationResult>;
  ai_rate_evaluation_samples: ToolHandler<{
    setId: string;
    limit?: number;
    overwrite?: boolean;
    model?: string;
    timeout?: number;
  }, AiRateResult>;
  ai_rewrite_prompt: ToolHandler<{
    setId: string;
    maxScore?: number;
    limit?: number;
    model?: string;
    timeout?: number;
    extraInstructions?: string;
  }, AiRewriteResult>;
  ai_generate_evaluation_samples: ToolHandler<{
    setId: string;
    count?: number;
    question?: string;
    generateAnswers?: boolean;
    dryRun?: boolean;
    model?: string;
    timeout?: number;
    instructions?: string;
  }, AiGenerateSamplesResult>;
  apply_prompt_rewrite: ToolHandler<{
    setId: string;
    rewrittenPrompt?: string;
    maxScore?: number;
    limit?: number;
    model?: string;
    timeout?: number;
    extraInstructions?: string;
    name?: string;
    description?: string;
    dryRun?: boolean;
  }, ApplyRewriteResult>;
} {
  return {
    create_evaluation_set: {
      description: 'Create a prompt evaluation set bound to an asset version snapshot',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string', description: 'Asset ID' },
          version: { type: 'number', description: 'Existing version snapshot number' },
          name: { type: 'string', description: 'Evaluation set name' },
          mode: {
            type: 'string',
            enum: ['score', 'gsb'],
            description: 'score: 1-5 rating; gsb: Good/Same/Bad pairwise comparison',
          },
          description: { type: 'string', description: 'Optional description' },
        },
        required: ['assetId', 'version', 'name', 'mode'],
      },
      handler: async (input) => createEvaluationSet(input),
    },

    list_evaluation_sets: {
      description: 'List evaluation sets for an asset, optionally filtered by version',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string', description: 'Asset ID' },
          version: { type: 'number', description: 'Optional version snapshot number' },
        },
        required: ['assetId'],
      },
      handler: async ({ assetId, version }) => listEvaluationSets(assetId, version),
    },

    add_evaluation_sample: {
      description: 'Add a sample to an evaluation set; {{variables}} in question are rendered locally',
      inputSchema: {
        type: 'object',
        properties: {
          setId: { type: 'string', description: 'Evaluation set ID' },
          question: { type: 'string', description: 'Question template with {{variables}}' },
          answer: { type: 'string', description: 'Model answer to evaluate' },
          variables: { type: 'object', description: 'Values used to render {{variables}}' },
          idealAnswer: { type: 'string', description: 'Ideal answer (score mode)' },
          referenceAnswer: { type: 'string', description: 'Reference answer (GSB mode)' },
          feedback: { type: 'string', description: 'Optional free-form feedback' },
        },
        required: ['setId', 'question', 'answer'],
      },
      handler: async (input) => addEvaluationSample(input),
    },

    rate_evaluation_sample: {
      description: 'Rate a sample with a 1-5 score or a GSB verdict, matching the set mode',
      inputSchema: {
        type: 'object',
        properties: {
          sampleId: { type: 'string', description: 'Evaluation sample ID' },
          score: { type: 'number', minimum: 1, maximum: 5, description: 'Score from 1 to 5 (score mode)' },
          gsb: {
            type: 'string',
            enum: ['good', 'same', 'bad'],
            description: 'Verdict relative to the reference answer (GSB mode)',
          },
          feedback: { type: 'string', description: 'Optional free-form feedback' },
        },
        required: ['sampleId'],
      },
      handler: async ({ sampleId, ...rating }) => rateEvaluationSample(sampleId, rating),
    },

    evaluation_summary: {
      description: 'Summarise ratings: total/rated samples, average score and GSB distribution',
      inputSchema: {
        type: 'object',
        properties: {
          setId: { type: 'string', description: 'Evaluation set ID' },
        },
        required: ['setId'],
      },
      handler: async ({ setId }) => getEvaluationSummary(setId),
    },

    add_evaluation_samples: {
      description: 'Build an evaluation dataset in one transaction from one seed question and a list of variable sets',
      inputSchema: {
        type: 'object',
        properties: {
          setId: { type: 'string', description: 'Evaluation set ID' },
          question: { type: 'string', description: 'Seed question template with {{variables}}' },
          samples: {
            type: 'array',
            description: 'One entry per rendered sample',
            items: {
              type: 'object',
              properties: {
                answer: { type: 'string', description: 'Model answer to evaluate' },
                variables: { type: 'object', description: 'Values used to render {{variables}}' },
                idealAnswer: { type: 'string', description: 'Ideal answer (score mode)' },
                referenceAnswer: { type: 'string', description: 'Reference answer (GSB mode)' },
                feedback: { type: 'string', description: 'Optional free-form feedback' },
              },
              required: ['answer'],
            },
          },
        },
        required: ['setId', 'question', 'samples'],
      },
      handler: async (input) => addEvaluationSamples(input),
    },

    list_evaluation_samples: {
      description: 'List sample details; filter by rating state, low score or GSB verdict to focus on weak cases',
      inputSchema: {
        type: 'object',
        properties: {
          setId: { type: 'string', description: 'Evaluation set ID' },
          rated: { type: 'boolean', description: 'true: rated only; false: unrated only' },
          maxScore: { type: 'number', description: 'Score mode only: samples with score <= this value' },
          gsb: { type: 'string', enum: ['good', 'same', 'bad'], description: 'GSB mode only: verdict to match' },
          limit: { type: 'number', description: 'Maximum samples to return (default 100)' },
        },
        required: ['setId'],
      },
      handler: async ({ setId, ...options }) => listEvaluationSamples(setId, options),
    },

    compare_evaluation_sets: {
      description: 'Compare two evaluation sets of the same asset to tell whether a newer version improved',
      inputSchema: {
        type: 'object',
        properties: {
          baselineSetId: { type: 'string', description: 'Evaluation set ID of the earlier version' },
          candidateSetId: { type: 'string', description: 'Evaluation set ID of the later version' },
        },
        required: ['baselineSetId', 'candidateSetId'],
      },
      handler: async ({ baselineSetId, candidateSetId }) =>
        compareEvaluationSets(baselineSetId, candidateSetId),
    },

    suggest_prompt_improvements: {
      description: 'Rule-based, local-only rewrite suggestions from weak samples (no model call)',
      inputSchema: {
        type: 'object',
        properties: {
          setId: { type: 'string', description: 'Evaluation set ID' },
          maxScore: {
            type: 'number',
            minimum: 1,
            maximum: 5,
            description: 'Score mode only: low-score threshold (default 2)',
          },
          limit: { type: 'number', description: 'Maximum weak sample IDs to return (default 20)' },
        },
        required: ['setId'],
      },
      handler: async ({ setId, ...options }) => suggestEvaluationImprovements(setId, options),
    },

    apply_evaluation_dsl: {
      description: 'Auto-rate samples with a local rule DSL (first matching rule wins); no model call',
      inputSchema: {
        type: 'object',
        properties: {
          setId: { type: 'string', description: 'Evaluation set ID' },
          dsl: {
            type: 'object',
            description: 'Ordered rules with `when` conditions (and/or/parentheses) plus score/gsb/feedback outcomes, and an optional default',
            properties: {
              default: { type: 'object', description: 'Outcome when no rule matches' },
              rules: {
                type: 'array',
                description: 'First matching rule wins',
                items: {
                  type: 'object',
                  properties: {
                    when: { type: 'string', description: 'Clauses joined by `and` / `or` with parentheses (`and` binds tighter), e.g. "(answer contains \'SQLite\' or answer contains \'WAL\') and len(answer) >= 40"' },
                    score: { type: 'number', description: '1-5 (score mode)' },
                    gsb: { type: 'string', enum: ['good', 'same', 'bad'], description: 'GSB mode' },
                    feedback: { type: 'string', description: 'Optional feedback attached to the rating' },
                  },
                  required: ['when'],
                },
              },
            },
            required: ['rules'],
          },
          dryRun: { type: 'boolean', description: 'Return decisions without writing ratings' },
          limit: { type: 'number', description: 'Maximum samples to inspect (1-1000, default 100)' },
          overwrite: { type: 'boolean', description: 'Also re-rate already rated samples (default false)' },
        },
        required: ['setId', 'dsl'],
      },
      handler: async ({ setId, dsl, ...options }) => applyEvaluationDsl(setId, dsl, options),
    },

    ai_rate_evaluation_samples: {
      description: 'Rate unrated samples with an AI provider (requires AGENTX_AI_API_KEY); invalid responses are skipped',
      inputSchema: {
        type: 'object',
        properties: {
          setId: { type: 'string', description: 'Evaluation set ID' },
          limit: { type: 'number', description: 'Maximum samples to rate (1-100, default 20)' },
          overwrite: { type: 'boolean', description: 'Also re-rate already rated samples' },
          model: { type: 'string', description: 'Override the configured model' },
          timeout: { type: 'number', description: 'Per-sample timeout in ms (default 30000)' },
        },
        required: ['setId'],
      },
      handler: async ({ setId, ...options }) => aiRateEvaluationSamples(setId, options),
    },

    ai_rewrite_prompt: {
      description: 'Ask an AI provider for a rewritten prompt from weak samples (requires AGENTX_AI_API_KEY); never writes back to the asset',
      inputSchema: {
        type: 'object',
        properties: {
          setId: { type: 'string', description: 'Evaluation set ID' },
          maxScore: { type: 'number', description: 'Score mode only: low-score threshold (default 2)' },
          limit: { type: 'number', description: 'Maximum weak samples for context (default 10)' },
          model: { type: 'string', description: 'Override the configured model' },
          timeout: { type: 'number', description: 'Request timeout in ms (default 30000)' },
          extraInstructions: { type: 'string', description: 'Additional rewrite constraints' },
        },
        required: ['setId'],
      },
      handler: async ({ setId, ...options }) => aiRewritePrompt(setId, options),
    },

    ai_generate_evaluation_samples: {
      description: 'Expand an evaluation dataset from seed samples by generating diverse {{variables}} with an AI provider (requires AGENTX_AI_API_KEY)',
      inputSchema: {
        type: 'object',
        properties: {
          setId: { type: 'string', description: 'Evaluation set ID' },
          count: { type: 'number', description: 'Number of new variable sets (1-20, default 5)' },
          question: { type: 'string', description: 'Template with {{variables}}; defaults to the first seed sample' },
          generateAnswers: { type: 'boolean', description: 'Let the model answer each rendered question (default true)' },
          dryRun: { type: 'boolean', description: 'Return candidates without writing samples' },
          model: { type: 'string', description: 'Override the configured model' },
          timeout: { type: 'number', description: 'Per-request timeout in ms (default 30000)' },
          instructions: { type: 'string', description: 'Extra guidance for variable diversity' },
        },
        required: ['setId'],
      },
      handler: async ({ setId, ...options }) => aiGenerateEvaluationSamples(setId, options),
    },

    apply_prompt_rewrite: {
      description: 'Apply a rewrite candidate: update the asset, create a version snapshot and bind a new evaluation set (offline when rewrittenPrompt is supplied)',
      inputSchema: {
        type: 'object',
        properties: {
          setId: { type: 'string', description: 'Baseline evaluation set ID' },
          rewrittenPrompt: { type: 'string', description: 'Candidate prompt; omit to generate one with an AI provider' },
          maxScore: { type: 'number', description: 'Score mode only: low-score threshold' },
          limit: { type: 'number', description: 'Maximum weak samples for context' },
          model: { type: 'string', description: 'Override the configured model' },
          timeout: { type: 'number', description: 'Request timeout in ms' },
          extraInstructions: { type: 'string', description: 'Additional rewrite constraints' },
          name: { type: 'string', description: 'Name for the new evaluation set' },
          description: { type: 'string', description: 'Description for the new evaluation set' },
          dryRun: { type: 'boolean', description: 'Preview without writing anything' },
        },
        required: ['setId'],
      },
      handler: async ({ setId, ...options }) => applyPromptRewrite(setId, options),
    },
  };
}
