import {
  createEvaluationSet,
  listEvaluationSets,
  addEvaluationSample,
  rateEvaluationSample,
  getEvaluationSummary,
} from '../store/evaluations.js';
import type {
  EvaluationSet,
  EvaluationSample,
  EvaluationSummary,
} from '../store/evaluations.js';
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
  };
}
