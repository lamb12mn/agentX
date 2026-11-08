/**
 * Intent routing for AgentX MCP tools.
 *
 * `match_tools` turns a natural-language request ("帮我看看有哪些提示词",
 * "roll back to the previous version") into a ranked list of concrete tool
 * names, with the reasons, required parameters and a ready-to-use call
 * template. It complements `discover_tools` (keyword / group browsing) and
 * keeps the default `tools/list` small.
 *
 * Scoring is deterministic and fully local by default: a bilingual action /
 * object lexicon is matched against tool-name tokens and description tokens.
 * `useAi: true` optionally re-ranks the local candidates with the configured
 * AiProvider; without a provider it fails loudly, and a provider error falls
 * back to the local ranking.
 *
 * `execute: true` may run the best match, but only when the intent is
 * unambiguous, all required parameters are supplied, and the tool is on the
 * read-only allowlist. Write operations are NEVER executed automatically.
 */

import {
  createAiProviderFromEnv,
  AiProviderNotConfiguredError,
} from '../ai/provider.js';
import type { AiProvider } from '../ai/provider.js';
import { MATCH_TOOL, META_TOOLS } from './catalog.js';
import type { CatalogTool } from './catalog.js';

// ── Bilingual intent lexicon ────────────────────────────────────────────────
// Keys are canonical tokens that also occur in tool names / descriptions.

const ACTIONS: Record<string, readonly string[]> = {
  create: ['创建', '新建', '新增', '添加', '写一个', '做一个', '建立', '建一个', 'create', 'new', 'add', 'make', 'register'],
  list: ['列出', '列一下', '有哪些', '查看所有', '查看', '看看', '显示', '清单', '列表', '枚举', '浏览', 'list', 'show', 'browse', 'enumerate'],
  get: ['获取', '读取', '拿到', '详情', '查一下某个', 'get', 'fetch', 'read', 'detail', 'retrieve'],
  update: ['更新', '修改', '改一下', '编辑', '调整', '变更', 'update', 'edit', 'modify', 'change'],
  delete: ['删除', '删掉', '移除', '去掉', 'delete', 'remove', 'drop'],
  search: ['搜索', '检索', '查找', '找一找', '找', 'search', 'find', 'query', 'lookup'],
  compare: ['对比', '比较', '对照', '比一比', '差异', 'compare', 'diff', 'versus'],
  rate: ['评分', '打分', '评级', '给分', '打分儿', 'rate', 'grade'],
  rewrite: ['改写', '重写', '优化', '改进', '润色', 'rewrite', 'improve', 'optimize', 'refine'],
  export: ['导出', '输出', 'export', 'dump'],
  import: ['导入', '引入', 'import', 'ingest'],
  rollback: ['回滚', '还原', '恢复', '回退', 'rollback', 'revert', 'restore', 'roll back'],
  clone: ['克隆', '复制', '拷贝', 'clone', 'copy', 'duplicate'],
  run: ['执行', '运行', '跑一下', '跑', 'start', 'execute'],
  summary: ['汇总', '统计', '概览', '概况', '总结', 'summary', 'stat', 'stats', 'statistic', 'statistics', 'overview'],
  snapshot: ['快照', 'snapshot'],
  check: ['检查', '检测', '校验', '排查', 'check', 'detect', 'validate', 'verify'],
  apply: ['应用', '套用', '生效', 'apply'],
  suggest: ['建议', '诊断', 'suggest', 'recommend', 'advise'],
  generate: ['生成', '扩充', 'generate', 'synthesize'],
  cancel: ['取消', '终止', 'cancel', 'abort'],
  approve: ['批准', '通过', 'approve', 'accept'],
  reject: ['拒绝', '驳回', 'reject', 'deny'],
  clear: ['清空', '清理', 'clear', 'reset'],
  tag: ['打标签', '标签', 'tag'],
};

const OBJECTS: Record<string, readonly string[]> = {
  skill: ['技能', 'skill', 'skills'],
  prompt: ['提示词', '提示语', '模版', '模板', 'prompt', 'prompts'],
  rule: ['规则', 'rule', 'rules'],
  mcp: ['mcp服务', 'mcp配置', '服务配置', 'mcp', 'mcps'],
  workflow: ['工作流', '流程', 'workflow', 'workflows'],
  agent: ['智能体', '代理', 'agent', 'agents'],
  version: ['版本', 'version', 'versions'],
  evaluation: ['评测集', '评估集', '数据集', '评测', '评估', 'evaluation', 'eval', 'evalset', 'dataset'],
  sample: ['样本', '样例', '条目', 'sample', 'samples'],
  dependency: ['依赖关系', '依赖', 'dependency', 'dependencies', 'deps'],
  team: ['多智能体', '团队协作', '团队', 'team', 'teams'],
  vault: ['密钥', '凭证', '凭据', '密码', 'vault', 'secret', 'credential'],
  plugin: ['插件', 'plugin', 'plugins'],
  cache: ['缓存', 'cache'],
  asset: ['资产', '资源', 'asset', 'assets'],
  answer: ['回答', '答案', 'answer', 'response'],
  variable: ['占位符', '变量', 'variable', 'variables'],
  score: ['分数', '得分', '分值', 'score', 'scores'],
  gsb: ['gsb', '对比评分'],
  dsl: ['dsl', '规则打分', '自动打分'],
  ai: ['大模型', '模型', 'ai'],
  file: ['文件', 'file', 'files'],
};

const LEXICON: Record<string, readonly string[]> = { ...ACTIONS, ...OBJECTS };

/** Actions strong enough to penalise a contradictory tool name. */
const STRONG_ACTIONS = new Set([
  'create', 'list', 'get', 'update', 'delete', 'export', 'import',
  'rollback', 'clone', 'run', 'cancel', 'approve', 'reject', 'clear',
]);

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'with', 'by', 'from',
  'on', 'in', 'is', 'are', 'be', 'that', 'this', 'it', 'as', 'use', 'using',
  'returns', 'return', 'can', 'will', 'each', 'into', 'your', 'you', 'their',
  'its', 'via', 'optional', 'required', 'default', 'only', 'must', 'given',
]);

/** Only these tools may be auto-executed by `match_tools({ execute: true })`. */
const READ_ONLY_TOOL = /^(list_|get_|search_|check_|compare_|detect_|suggest_|team\.(status|list|history|logs|pending|results)|version_stats$|evaluation_summary$|list_evaluation_samples$)/;

/** Built-in library tools are called from create/update intent params, not from intent routing. */
const BUILTIN_LIBRARY_TOOL = /^(list_builtin_prompts|get_builtin_prompt|match_builtin_prompts)$/;

const LEXICON_ENTRIES = Object.entries(LEXICON)
  .flatMap(([concept, aliases]) => aliases.map(alias => ({ concept, alias: alias.toLowerCase() })))
  .sort((a, b) => b.alias.length - a.alias.length);

function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  return w;
}

function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem));
}

/**
 * Reverse map from an English surface token to its canonical concept(s).
 * Lets `version_stats` match the `summary/statistics` concept and `prompts`
 * match `prompt`, without guessing at query time.
 */
const TOKEN_TO_CONCEPT = new Map<string, Set<string>>();
for (const [concept, aliases] of Object.entries(LEXICON)) {
  const targets = [concept, ...aliases].filter(a => !/[\u4e00-\u9fff]/.test(a) && !a.includes(' '));
  for (const surface of targets) {
    const key = stem(surface);
    const bucket = TOKEN_TO_CONCEPT.get(key) ?? new Set<string>();
    bucket.add(concept);
    TOKEN_TO_CONCEPT.set(key, bucket);
  }
}

export interface IntentQuery {
  concepts: Set<string>;
  words: Set<string>;
  /** Phrase view: whitespace-normalised, used for multi-word English aliases. */
  normalized: string;
  /** Compact view: punctuation preserved, used for tool-name / typo matching. */
  compact: string;
  looksLikeToolName: boolean;
}

/** Extract canonical concepts from a Chinese or English natural-language intent. */
export function tokenizeIntent(text: string): IntentQuery {
  const raw = typeof text === 'string' ? text : '';
  const haystack = raw.toLowerCase();
  const normalized = haystack.replace(/[\s_-]+/g, ' ').trim();
  const compact = haystack.replace(/[\s-]+/g, '');
  const englishWords = words(raw);
  const significantWords = new Set([...englishWords].filter(w => w.length >= 3 && !STOPWORDS.has(w)));
  const concepts = new Set<string>();

  for (const { concept, alias } of LEXICON_ENTRIES) {
    const cjk = /[\u4e00-\u9fff]/.test(alias);
    const hit = cjk
      ? haystack.includes(alias)
      : alias.includes(' ')
        ? normalized.includes(alias)
        : englishWords.has(alias) || englishWords.has(stem(alias));
    if (hit) concepts.add(concept);
  }

  return {
    concepts,
    words: significantWords,
    normalized,
    compact,
    looksLikeToolName: /^[a-z][a-z0-9_.]*$/.test(compact) && /[_.]/.test(compact),
  };
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

interface ToolIndex {
  name: string;
  group: string;
  description: string;
  nameTokens: Set<string>;
  descTokens: Set<string>;
  strongActions: Set<string>;
  inputSchema?: Record<string, unknown>;
  exposed: boolean;
}

function indexTool(name: string, tool: CatalogTool, group: string, exposed: ReadonlySet<string>): ToolIndex {
  const rawNameTokens = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem);
  const nameTokens = new Set(rawNameTokens);
  for (const token of rawNameTokens) {
    for (const concept of TOKEN_TO_CONCEPT.get(token) ?? []) nameTokens.add(concept);
  }
  const descTokens = new Set(
    (tool.description ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
      .filter(w => !STOPWORDS.has(w)).map(stem),
  );
  return {
    name,
    group,
    description: tool.description ?? '',
    nameTokens,
    descTokens,
    strongActions: new Set([...nameTokens].filter(t => STRONG_ACTIONS.has(t))),
    ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
    exposed: exposed.has(name),
  };
}

export type Confidence = 'high' | 'medium' | 'low';

export interface IntentMatch {
  name: string;
  group: string;
  description: string;
  score: number;
  confidence: Confidence;
  reasons: string[];
  exposed: boolean;
  required: string[];
  missing: string[];
  callTemplate: { name: string; arguments: Record<string, unknown> };
  inputSchema?: Record<string, unknown>;
}

export interface MatchParams {
  intent: string;
  args?: Record<string, unknown>;
  limit?: number;
  includeSchema?: boolean;
  execute?: boolean;
  useAi?: boolean;
  group?: string;
}

export interface MatchResult {
  intent: string;
  engine: 'local' | 'local+ai';
  autoSelect: boolean;
  selected?: string;
  matches: IntentMatch[];
  aiRerank?: { status: 'applied' | 'failed'; reason?: string; error?: string };
  executed?: { name: string; args: Record<string, unknown>; result?: unknown; error?: string };
  refused?: string;
  hint: string;
}

export interface IntentContext {
  tools: Record<string, CatalogTool>;
  groups: Record<string, string>;
  exposed: ReadonlySet<string>;
  /** Optional executor for `execute: true` on read-only matches. */
  invoke?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Injected provider (tests); otherwise resolved from AGENTX_AI_API_KEY. */
  provider?: AiProvider;
  providerFactory?: () => AiProvider | undefined;
}

const HINT = 'Call the top match by name — hidden tools are callable without enabling them. '
  + 'Supply missing required parameters before calling; write operations are never auto-executed. '
  + 'Use discover_tools for keyword/group browsing.';

function safeLimit(value?: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) return 5;
  return value;
}

/** Pure, synchronous ranking. Exported separately so it is easy to test. */
export function rankTools(
  context: IntentContext,
  params: MatchParams,
  query = tokenizeIntent(params.intent),
): IntentMatch[] {
  const groupFilter = (params.group ?? '').trim();
  const args = params.args ?? {};
  const qStrong = new Set([...query.concepts].filter(c => STRONG_ACTIONS.has(c)));

  const scored: Array<{ match: IntentMatch; hiddenScore: number }> = [];

  for (const [name, tool] of Object.entries(context.tools)) {
    if (BUILTIN_LIBRARY_TOOL.test(name)) continue;
    const group = context.groups[name] ?? (name.includes('.') ? name.split('.')[0] : 'other');
    if (groupFilter && group !== groupFilter) continue;
    const index = indexTool(name, tool, group, context.exposed);

    let score = 0;
    const reasons: string[] = [];
    const seen = new Set<string>();
    for (const token of [...query.concepts, ...query.words]) {
      if (seen.has(token)) continue;
      seen.add(token);
      const kind = token in ACTIONS ? '动作' : token in OBJECTS ? '对象' : '词';
      if (index.nameTokens.has(token)) {
        const weight = kind === '动作' ? 10 : kind === '对象' ? 8 : 6;
        score += weight;
        reasons.push(`${kind} ${token} 命中工具名 (+${weight})`);
      } else if (index.descTokens.has(token)) {
        score += 2;
        reasons.push(`${kind} ${token} 命中描述 (+2)`);
      }
    }
    if (query.concepts.has(group)) {
      score += 3;
      reasons.push(`分组 ${group} 命中 (+3)`);
    }
    if (query.compact.includes(name.toLowerCase())) {
      score += 30;
      reasons.push('工具名精确出现 (+30)');
    }
    if (query.looksLikeToolName) {
      const distance = levenshtein(query.compact, name.toLowerCase());
      const similarity = 1 - distance / Math.max(query.compact.length, name.length);
      if (similarity >= 0.75) {
        score += 14 * similarity;
        reasons.push(`名称相似度 ${Math.round(similarity * 100)}%`);
      }
    }
    if (qStrong.size && index.strongActions.size
      && ![...qStrong].some(c => index.strongActions.has(c))) {
      score -= 8;
      reasons.push('动作冲突 (-8)');
    }
    if (score <= 0) continue;
    if (index.exposed) score += 0.5; // deterministic tie-break in favour of visible tools

    const required = Array.isArray(index.inputSchema?.required)
      ? (index.inputSchema?.required as unknown[]).filter((k): k is string => typeof k === 'string')
      : [];
    const confidence: Confidence = score >= 20 ? 'high' : score >= 10 ? 'medium' : 'low';
    const match: IntentMatch = {
      name,
      group,
      description: index.description,
      score: Math.round(score * 10) / 10,
      confidence,
      reasons,
      exposed: index.exposed,
      required,
      missing: required.filter(key => !(key in args)),
      callTemplate: { name, arguments: args },
      ...(params.includeSchema && index.inputSchema ? { inputSchema: index.inputSchema } : {}),
    };
    scored.push({ match, hiddenScore: score });
  }

  const ranked = scored
    .sort((a, b) => b.hiddenScore - a.hiddenScore || a.match.name.localeCompare(b.match.name))
    .map(entry => entry.match);
  return ranked.slice(0, safeLimit(params.limit));
}

async function rerankWithAi(
  provider: AiProvider,
  intent: string,
  candidates: IntentMatch[],
): Promise<{ ranked: string[]; reason?: string }> {
  const list = candidates.map(m => `- ${m.name}: ${m.description}`).join('\n');
  const response = await provider.execute([
    {
      role: 'system',
      content: 'You are a tool router. Reply with ONLY a JSON object {"ranked": ["tool_name", ...], "reason": "one short sentence"}. '
        + 'Rank candidate tools by how well each one fulfils the user intent. Use only names from the candidate list.',
    },
    { role: 'user', content: `Intent: ${intent}\nCandidates:\n${list}` },
  ], { temperature: 0, maxTokens: 300, timeout: 8000 });

  const raw = response.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(raw) as { ranked?: unknown; reason?: unknown };
  if (!Array.isArray(parsed.ranked)) throw new Error('AI rerank response missing ranked[]');
  const allowed = new Set(candidates.map(m => m.name));
  const ranked = parsed.ranked.filter((n): n is string => typeof n === 'string' && allowed.has(n));
  if (!ranked.length) throw new Error('AI rerank returned no valid tool names');
  return {
    ranked: [...new Set([...ranked, ...candidates.map(m => m.name)])],
    ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
  };
}

/** Rank tools for an intent and optionally auto-execute a safe, unambiguous match. */
export async function matchIntent(context: IntentContext, params: MatchParams): Promise<MatchResult> {
  if (typeof params.intent !== 'string' || !params.intent.trim()) {
    throw new Error('match_tools requires a non-empty `intent` string');
  }
  const query = tokenizeIntent(params.intent);
  const args = params.args ?? {};
  let ranked = rankTools(context, { ...params, limit: Math.max(safeLimit(params.limit), params.useAi ? 10 : 5) }, query);
  let aiRerank: MatchResult['aiRerank'];

  if (params.useAi) {
    const provider = context.provider ?? (context.providerFactory ?? createAiProviderFromEnv)();
    if (!provider) throw new AiProviderNotConfiguredError();
    try {
      const ai = await rerankWithAi(provider, params.intent, ranked.slice(0, 10));
      const byName = new Map(ranked.map(m => [m.name, m]));
      ranked = [...ai.ranked.map(name => byName.get(name)).filter((m): m is IntentMatch => !!m),
        ...ranked.filter(m => !ai.ranked.includes(m.name))];
      aiRerank = { status: 'applied', ...(ai.reason ? { reason: ai.reason } : {}) };
    } catch (error) {
      aiRerank = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }

  const matches = ranked.slice(0, safeLimit(params.limit));
  const best = matches[0];
  const runnerUp = ranked[1];
  const autoSelect = !!best && best.score >= 16
    && (!runnerUp || best.score - runnerUp.score >= 4);

  const result: MatchResult = {
    intent: params.intent,
    engine: params.useAi ? 'local+ai' : 'local',
    autoSelect,
    ...(autoSelect && best ? { selected: best.name } : {}),
    matches,
    ...(aiRerank ? { aiRerank } : {}),
    hint: HINT,
  };

  if (params.execute) {
    if (!best) result.refused = '未匹配到任何工具';
    else if (!autoSelect) result.refused = '意图不够明确（置信度不足或候选过于接近），未自动执行';
    else if (META_TOOLS.includes(best.name)) result.refused = '元工具不参与自动执行';
    else if (!READ_ONLY_TOOL.test(best.name)) {
      result.refused = `工具 ${best.name} 涉及写操作，不自动执行；请按 callTemplate 显式调用`;
    } else if (best.missing.length) result.refused = `缺少必填参数: ${best.missing.join(', ')}`;
    else if (!context.invoke) result.refused = '未配置执行器，仅返回匹配结果';
    else {
      try {
        result.executed = { name: best.name, args, result: await context.invoke(best.name, args) };
      } catch (error) {
        result.executed = {
          name: best.name, args,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return result;
}

/** Register the always-exposed intent-routing meta tool. */
export function registerIntentTools(context: IntentContext) {
  return {
    match_tools: {
      description: 'Route a natural-language intent to the best matching AgentX tools (Chinese or English). '
        + 'Returns ranked tool names with reasons, confidence, required parameters and a call template. '
        + 'Use this FIRST when you are unsure which tool to call; hidden tools remain callable by name.',
      inputSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string', description: 'User request in natural language, e.g. "帮我看看有哪些提示词" or "roll back to the previous version"' },
          args: { type: 'object', description: 'Known arguments; used to compute missing required fields and for auto-execution' },
          limit: { type: 'number', description: 'Maximum candidates, 1-20 (default 5)' },
          includeSchema: { type: 'boolean', description: 'Include each tool inputSchema (default false)' },
          group: { type: 'string', description: 'Restrict candidates to one group, e.g. evaluations / teams / versions' },
          execute: { type: 'boolean', description: 'Auto-run the best match when unambiguous, read-only and all required args are present (default false; writes are never auto-executed)' },
          useAi: { type: 'boolean', description: 'Re-rank local candidates with AGENTX_AI_API_KEY provider (default false; degrades to local on provider error)' },
        },
        required: ['intent'],
      },
      handler: async (params: MatchParams): Promise<MatchResult> => matchIntent(context, params),
    },
  };
}

export { MATCH_TOOL };
