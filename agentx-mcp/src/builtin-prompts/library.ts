import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Immutable built-in prompt library.
 *
 * Data is captured verbatim from https://garden.always200.com/ via chrome-tools
 * (Nuxt `_payload.json` per prompt route). It lives in source/dist, never in the
 * user asset store, so the regular asset CRUD tools cannot reach it.
 */

export const BUILTIN_ID_PREFIX = 'builtin:';

export interface BuiltinPrompt {
  readonly id: string;
  readonly sourceId: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly categoryPath: readonly string[];
  readonly tags: readonly string[];
  readonly type: string;
  readonly promptType?: string;
  readonly generationType?: string;
  readonly optimizerTarget?: string;
  readonly scene?: string;
  readonly hasParameters: boolean;
  readonly parameters: readonly unknown[];
  readonly importCode: string;
  readonly promptText: string;
  readonly notes: string;
  readonly source: string;
  readonly sourceUrl?: string;
  readonly createdAt: string;
  readonly images: readonly unknown[];
  readonly showcases: readonly unknown[];
  readonly examples: readonly unknown[];
}

interface CapturedItem {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  categoryPath?: string[];
  tags?: string[];
  type?: string;
  promptType?: string;
  generationType?: string;
  optimizerTarget?: string;
  scene?: string;
  hasParameters?: boolean;
  parameters?: unknown[];
  importCode?: string;
  promptText: string | null;
  notes?: string;
  source?: string;
  sourceUrl?: string;
  createdAt?: string;
  images?: unknown[];
  showcases?: unknown[];
  examples?: unknown[];
}

interface CaptureFile {
  source: string;
  capturedAt: string;
  language: string;
  expected: number;
  total: number;
  errors: unknown[];
  items: CapturedItem[];
}

const here = dirname(fileURLToPath(import.meta.url));
const capture = JSON.parse(
  readFileSync(join(here, 'garden-prompts.json'), 'utf-8'),
) as CaptureFile;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

const library: readonly BuiltinPrompt[] = deepFreeze(
  capture.items.map((item) => ({
    id: BUILTIN_ID_PREFIX + item.id,
    sourceId: item.id,
    title: item.title ?? item.id,
    description: item.description ?? '',
    category: item.category ?? '',
    categoryPath: item.categoryPath ?? [],
    tags: item.tags ?? [],
    type: item.type ?? 'text',
    promptType: item.promptType,
    generationType: item.generationType,
    optimizerTarget: item.optimizerTarget,
    scene: item.scene,
    hasParameters: item.hasParameters ?? (item.parameters?.length ?? 0) > 0,
    parameters: item.parameters ?? [],
    importCode: item.importCode ?? '',
    promptText: item.promptText ?? '',
    notes: item.notes ?? '',
    source: item.source ?? '',
    sourceUrl: item.sourceUrl,
    createdAt: item.createdAt ?? '',
    images: item.images ?? [],
    showcases: item.showcases ?? [],
    examples: item.examples ?? [],
  })),
);

export function listBuiltinPrompts(): readonly BuiltinPrompt[] {
  return library;
}

export function getBuiltinPrompt(id: string): BuiltinPrompt | undefined {
  const full = id.startsWith(BUILTIN_ID_PREFIX) ? id : BUILTIN_ID_PREFIX + id;
  return library.find((item) => item.id === full);
}

export function isBuiltinId(id: string): boolean {
  return id.startsWith(BUILTIN_ID_PREFIX) || getBuiltinPrompt(id) !== undefined;
}

/** Guard for every asset mutation path: built-in prompts are immutable. */
export function assertNotBuiltin(id: string): void {
  if (isBuiltinId(id)) {
    throw new Error(`Built-in prompts are read-only and cannot be modified or deleted: ${id}`);
  }
}

export function builtinStats(): {
  source: string;
  capturedAt: string;
  expected: number;
  total: number;
  captureErrors: number;
  promptTextChars: number;
  byType: Record<string, number>;
} {
  return {
    source: capture.source,
    capturedAt: capture.capturedAt,
    expected: capture.expected,
    total: library.length,
    captureErrors: capture.errors.length,
    promptTextChars: library.reduce((sum, item) => sum + item.promptText.length, 0),
    byType: library.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

export interface BuiltinMatch {
  id: string;
  title: string;
  category: string;
  tags: readonly string[];
  type: string;
  score: number;
  reasons: string[];
}

export interface MatchOptions {
  limit?: number;
  type?: string;
  category?: string;
}

/** Local, offline weighted matcher over title/tags/category/description/body. */
export function matchBuiltinPrompts(query: string, options: MatchOptions = {}): BuiltinMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const tokens = new Set<string>();
  for (const match of q.matchAll(/[a-z0-9]+|[\u4e00-\u9fff]+/g)) {
    const word = match[0];
    tokens.add(word);
    if (/^[\u4e00-\u9fff]+$/.test(word)) {
      for (let i = 0; i < word.length - 1; i += 1) {
        tokens.add(word.slice(i, i + 2));
      }
    }
  }

  const fields: Array<[keyof BuiltinPrompt, number, string]> = [
    ['title', 8, '标题'],
    ['tags', 5, '标签'],
    ['categoryPath', 4, '分类'],
    ['description', 3, '描述'],
    ['promptText', 1, '正文'],
  ];

  const scored: BuiltinMatch[] = [];
  for (const item of library) {
    if (options.type && item.type !== options.type) continue;
    if (options.category && !item.category.includes(options.category)) continue;

    let score = 0;
    const reasons: string[] = [];
    for (const [field, weight, label] of fields) {
      const raw = item[field];
      const text = Array.isArray(raw) ? raw.join(' ').toLowerCase() : String(raw ?? '').toLowerCase();
      let hits = 0;
      for (const token of tokens) {
        if (text.includes(token)) hits += 1;
      }
      if (hits > 0) {
        score += hits * weight;
        reasons.push(`${label}命中 ${hits} 项 (+${hits * weight})`);
      }
    }
    if (score > 0) {
      scored.push({
        id: item.id,
        title: item.title,
        category: item.category,
        tags: item.tags,
        type: item.type,
        score,
        reasons,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, options.limit ?? 5);
}

export interface AutoBuiltinMatch {
  readonly id: string;
  readonly title: string;
  readonly score: number;
  readonly text: string;
  readonly reference: string;
}

/** Resolve the best built-in prompt for an intent; used by create/update tool chains. */
export function autoMatchBuiltin(query: string): AutoBuiltinMatch | null {
  const top = matchBuiltinPrompts(query, { limit: 1 })[0];
  if (!top) return null;
  const item = getBuiltinPrompt(top.id);
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    score: top.score,
    text: item.promptText,
    reference: renderBuiltinReference(item),
  };
}

/** Render a matched built-in prompt as a reference block for optimization flows. */
export function renderBuiltinReference(item: BuiltinPrompt): string {
  const meta = [
    `内置提示词: ${item.title}`,
    `ID: ${item.id}`,
    `分类: ${item.categoryPath.join(' / ') || item.category}`,
    `标签: ${item.tags.join(', ')}`,
    `来源: https://garden.always200.com/prompts/${item.sourceId}`,
  ].join('\n');

  return [
    '## 内置参考提示词（只读）',
    '',
    meta,
    '',
    '### 提示词正文',
    '',
    item.promptText,
    ...(item.notes ? ['', '### 使用说明', '', item.notes] : []),
  ].join('\n');
}
