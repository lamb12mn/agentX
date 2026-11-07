/**
 * Local scoring DSL for prompt evaluation samples.
 *
 * A DSL document is an ordered list of rules plus an optional default:
 *
 *   {
 *     "default": { "score": 3 },
 *     "rules": [
 *       { "when": "len(answer) < 40", "score": 1, "feedback": "回答过短" },
 *       { "when": "answer contains 'SQLite' and len(answer) >= 40", "score": 5 }
 *     ]
 *   }
 *
 * Conditions are `field op value` clauses joined by `and`; the first matching
 * rule wins. Fields: answer, question, rendered_question, ideal_answer,
 * reference_answer, feedback, score, gsb, rated, variables.<key>, len(<field>).
 * Operators: = != > >= < <= contains !contains. Quote multi-word values.
 *
 * Purely local — no model calls and no new dependencies.
 */
import {
  getEvaluationSummary,
  listEvaluationSamples,
  rateEvaluationSample,
} from './evaluations.js';
import type { EvaluationSample } from './evaluations.js';
import type { EvaluationMode, GsbVerdict } from '../types.js';

export type DslOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | '!contains';

export interface DslClause {
  field: string;
  op: DslOperator;
  value: string | number | boolean;
}

export interface DslOutcome {
  score?: number;
  gsb?: GsbVerdict;
  feedback?: string;
}

export interface DslRule extends DslOutcome {
  when: string;
}

export interface EvaluationDsl {
  default?: DslOutcome;
  rules: DslRule[];
}

export interface ApplyDslOptions {
  /** Compute decisions without writing ratings. */
  dryRun?: boolean;
  /** Maximum samples to inspect (1-1000, default 100). */
  limit?: number;
  /** Also re-rate samples that already have a rating. */
  overwrite?: boolean;
}

export interface DslDecision extends DslOutcome {
  sampleId: string;
  /** Index of the matching rule, or null when the default was applied. */
  ruleIndex: number | null;
}

export interface DslApplicationResult {
  setId: string;
  mode: EvaluationMode;
  evaluated: number;
  matched: number;
  written: number;
  dryRun: boolean;
  decisions: DslDecision[];
}

const KNOWN_FIELDS = new Set([
  'answer', 'question', 'rendered_question', 'ideal_answer',
  'reference_answer', 'feedback', 'score', 'gsb', 'rated',
]);
const CLAUSE_RE = /^(.+?)\s*(!contains|contains|>=|<=|!=|=|>|<)\s*(.+)$/;

/** Parse one `when` expression into clauses; throws on unknown fields or bad syntax. */
export function parseExpression(expression: string): DslClause[] {
  if (typeof expression !== 'string' || !expression.trim()) {
    throw new Error('DSL condition must be a non-empty string');
  }
  return expression.split(/\s+and\s+/i).map((part) => {
    const match = part.trim().match(CLAUSE_RE);
    if (!match) throw new Error(`Invalid DSL clause: "${part.trim()}"`);
    const field = match[1].trim().replace(/\s+/g, '');
    validateField(field);
    return { field, op: match[2] as DslOperator, value: parseValue(match[3]) };
  });
}

function validateField(field: string): void {
  const inner = field.startsWith('len(') && field.endsWith(')')
    ? field.slice(4, -1).trim()
    : field;
  if (KNOWN_FIELDS.has(inner) || inner.startsWith('variables.')) return;
  throw new Error(`Unknown DSL field: "${field}"`);
}

function parseValue(raw: string): string | number | boolean {
  const value = raw.trim();
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function resolveField(field: string, sample: EvaluationSample): unknown {
  if (field.startsWith('len(') && field.endsWith(')')) {
    const value = resolveField(field.slice(4, -1).trim(), sample);
    if (value === undefined || value === null) return 0;
    return Array.isArray(value) ? value.length : String(value).length;
  }
  if (field.startsWith('variables.')) {
    return sample.variables?.[field.slice('variables.'.length)];
  }
  const values: Record<string, unknown> = {
    answer: sample.answer,
    question: sample.question,
    rendered_question: sample.rendered_question,
    ideal_answer: sample.ideal_answer,
    reference_answer: sample.reference_answer,
    feedback: sample.feedback,
    score: sample.score,
    gsb: sample.gsb,
    rated: sample.score !== undefined || sample.gsb !== undefined,
  };
  return values[field];
}

function matchesClause(clause: DslClause, sample: EvaluationSample): boolean {
  const actual = resolveField(clause.field, sample);
  const expected = clause.value;
  switch (clause.op) {
    case '=':
      return actual !== undefined && actual !== null && String(actual) === String(expected);
    case '!=':
      return String(actual ?? '') !== String(expected);
    case 'contains':
      return String(actual ?? '').includes(String(expected));
    case '!contains':
      return !String(actual ?? '').includes(String(expected));
    default: {
      const left = Number(actual);
      const right = Number(expected);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      if (clause.op === '>') return left > right;
      if (clause.op === '>=') return left >= right;
      if (clause.op === '<') return left < right;
      return left <= right;
    }
  }
}

export function matchesExpression(clauses: DslClause[], sample: EvaluationSample): boolean {
  return clauses.every(clause => matchesClause(clause, sample));
}

function validateOutcome(outcome: DslOutcome, mode: EvaluationMode, label: string): void {
  if (mode === 'score') {
    if (outcome.gsb !== undefined) throw new Error(`${label}: gsb is not allowed in score mode`);
    if (outcome.score === undefined || !Number.isInteger(outcome.score) ||
        outcome.score < 1 || outcome.score > 5) {
      throw new Error(`${label}: score must be an integer between 1 and 5`);
    }
  } else {
    if (outcome.score !== undefined) throw new Error(`${label}: score is not allowed in GSB mode`);
    if (outcome.gsb !== 'good' && outcome.gsb !== 'same' && outcome.gsb !== 'bad') {
      throw new Error(`${label}: gsb must be 'good', 'same' or 'bad'`);
    }
  }
}

/** Apply a DSL document to a set's samples and write the resulting ratings. */
export function applyEvaluationDsl(
  setId: string,
  dsl: EvaluationDsl,
  options: ApplyDslOptions = {},
): DslApplicationResult {
  const { mode } = getEvaluationSummary(setId);
  if (!dsl || !Array.isArray(dsl.rules)) {
    throw new Error('dsl.rules must be an array');
  }

  const compiled = dsl.rules.map((rule, index) => {
    if (!rule || typeof rule.when !== 'string') {
      throw new Error(`Rule ${index}: "when" must be a string`);
    }
    validateOutcome(rule, mode, `Rule ${index}`);
    return { clauses: parseExpression(rule.when), outcome: rule };
  });
  const fallback = dsl.default;
  if (fallback) validateOutcome(fallback, mode, 'default');

  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('limit must be an integer between 1 and 1000');
  }

  const samples = listEvaluationSamples(setId, {
    ...(options.overwrite ? {} : { rated: false }),
    limit,
  });

  const decisions: DslDecision[] = [];
  for (const sample of samples) {
    const index = compiled.findIndex(rule => matchesExpression(rule.clauses, sample));
    const outcome = index >= 0 ? compiled[index].outcome : fallback;
    if (!outcome) continue;
    decisions.push({
      sampleId: sample.id,
      ruleIndex: index >= 0 ? index : null,
      ...(outcome.score !== undefined ? { score: outcome.score } : {}),
      ...(outcome.gsb !== undefined ? { gsb: outcome.gsb } : {}),
      ...(outcome.feedback !== undefined ? { feedback: outcome.feedback } : {}),
    });
  }

  if (!options.dryRun) {
    for (const decision of decisions) {
      rateEvaluationSample(decision.sampleId, {
        ...(decision.score !== undefined ? { score: decision.score } : {}),
        ...(decision.gsb !== undefined ? { gsb: decision.gsb } : {}),
        ...(decision.feedback !== undefined ? { feedback: decision.feedback } : {}),
      });
    }
  }

  return {
    setId,
    mode,
    evaluated: samples.length,
    matched: decisions.length,
    written: options.dryRun ? 0 : decisions.length,
    dryRun: Boolean(options.dryRun),
    decisions,
  };
}
