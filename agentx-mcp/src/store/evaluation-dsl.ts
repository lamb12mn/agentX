/**
 * Local scoring DSL for prompt evaluation samples.
 *
 * A DSL document is an ordered list of rules plus an optional default:
 *
 *   {
 *     "default": { "score": 3 },
 *     "rules": [
 *       { "when": "len(answer) < 40", "score": 1, "feedback": "回答过短" },
 *       { "when": "(answer contains 'SQLite' or answer contains 'WAL') and len(answer) >= 40", "score": 5 }
 *     ]
 *   }
 *
 * Conditions are `field op value` clauses combined with `and` / `or` and
 * parentheses (`and` binds tighter); the first matching rule wins.
 * Fields: answer, question, rendered_question, ideal_answer,
 * reference_answer, feedback, score, gsb, rated, variables.<key>, len(<field>).
 * Operators: = != > >= < <= contains !contains. Quote multi-word values;
 * quoted values may safely contain spaces and the words `and` / `or`.
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

/** Boolean condition tree. `parseExpression` exposes the flat `and`-chain view. */
export type DslCondition =
  | { kind: 'clause'; clause: DslClause }
  | { kind: 'and'; children: DslCondition[] }
  | { kind: 'or'; children: DslCondition[] };

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
const LEN_RE = /^len\([^()]*\)/i;

type Token =
  | { kind: 'word'; text: string }
  | { kind: 'logic'; text: 'and' | 'or' }
  | { kind: 'paren'; text: '(' | ')' };

/** Split a condition into words, logic keywords and grouping parentheses. */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let buffer = '';
  let quote: string | null = null;

  const flush = (): void => {
    const text = buffer.trim();
    buffer = '';
    if (!text) return;
    const lower = text.toLowerCase();
    if (lower === 'and' || lower === 'or') tokens.push({ kind: 'logic', text: lower });
    else tokens.push({ kind: 'word', text });
  };

  for (let i = 0; i < expression.length; i += 1) {
    const ch = expression[i];
    if (quote) {
      buffer += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      buffer += ch;
      continue;
    }
    // `len(<field>)` is an atomic field expression, not a grouping paren.
    const lenMatch = expression.slice(i).match(LEN_RE);
    if (lenMatch) {
      buffer += lenMatch[0];
      i += lenMatch[0].length - 1;
      continue;
    }
    if (ch === '(' || ch === ')') {
      flush();
      tokens.push({ kind: 'paren', text: ch });
      continue;
    }
    if (/\s/.test(ch)) flush();
    else buffer += ch;
  }
  if (quote) throw new Error('Unterminated quote in DSL condition');
  flush();
  return tokens;
}

function parseClause(text: string): DslClause {
  const match = text.trim().match(CLAUSE_RE);
  if (!match) throw new Error(`Invalid DSL clause: "${text.trim()}"`);
  const field = match[1].trim().replace(/\s+/g, '');
  validateField(field);
  return { field, op: match[2] as DslOperator, value: parseValue(match[3]) };
}

/**
 * Parse a full boolean condition. `and` binds tighter than `or`; parentheses
 * override precedence. Quoted values stay intact as a single word.
 */
export function parseCondition(expression: string): DslCondition {
  if (typeof expression !== 'string' || !expression.trim()) {
    throw new Error('DSL condition must be a non-empty string');
  }
  const tokens = tokenize(expression);
  let cursor = 0;

  function peek(): Token | undefined {
    return tokens[cursor];
  }

  function consumeClause(): DslCondition {
    const words: string[] = [];
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (token.kind !== 'word') break;
      words.push(token.text);
      cursor += 1;
    }
    return { kind: 'clause', clause: parseClause(words.join(' ')) };
  }

  function parseAtom(): DslCondition {
    const token = peek();
    if (!token) throw new Error('Incomplete DSL condition');
    if (token.kind === 'logic') throw new Error(`Unexpected "${token.text}" in DSL condition`);
    if (token.kind === 'word') return consumeClause();
    if (token.text === ')') throw new Error('Unmatched ")" in DSL condition');
    cursor += 1;
    const inner = parseOr();
    const closing = peek();
    if (!closing || closing.kind !== 'paren' || closing.text !== ')') {
      throw new Error('Unmatched "(" in DSL condition');
    }
    cursor += 1;
    return inner;
  }

  function parseAnd(): DslCondition {
    const children = [parseAtom()];
    for (;;) {
      const token = peek();
      if (!token || token.kind !== 'logic' || token.text !== 'and') break;
      cursor += 1;
      children.push(parseAtom());
    }
    return children.length === 1 ? children[0] : { kind: 'and', children };
  }

  function parseOr(): DslCondition {
    const children = [parseAnd()];
    for (;;) {
      const token = peek();
      if (!token || token.kind !== 'logic' || token.text !== 'or') break;
      cursor += 1;
      children.push(parseAnd());
    }
    return children.length === 1 ? children[0] : { kind: 'or', children };
  }

  const result = parseOr();
  if (cursor < tokens.length) {
    throw new Error(`Unexpected token "${tokens[cursor].text}" in DSL condition`);
  }
  return result;
}

/** Parse a flat `and`-chain into clauses; rejects `or` and parentheses. */
export function parseExpression(expression: string): DslClause[] {
  const collect = (node: DslCondition): DslClause[] | null => {
    if (node.kind === 'clause') return [node.clause];
    if (node.kind !== 'and') return null;
    const clauses: DslClause[] = [];
    for (const child of node.children) {
      const nested = collect(child);
      if (!nested) return null;
      clauses.push(...nested);
    }
    return clauses;
  };
  const clauses = collect(parseCondition(expression));
  if (!clauses) {
    throw new Error('parseExpression only supports `and` chains; use parseCondition for `or` / parentheses');
  }
  return clauses;
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

export function matchesExpression(
  condition: DslClause[] | DslCondition,
  sample: EvaluationSample,
): boolean {
  if (Array.isArray(condition)) return condition.every(clause => matchesClause(clause, sample));
  if (condition.kind === 'clause') return matchesClause(condition.clause, sample);
  if (condition.kind === 'and') {
    return condition.children.every(child => matchesExpression(child, sample));
  }
  return condition.children.some(child => matchesExpression(child, sample));
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
    return { condition: parseCondition(rule.when), outcome: rule };
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
    const index = compiled.findIndex(rule => matchesExpression(rule.condition, sample));
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
