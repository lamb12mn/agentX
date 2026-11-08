import { describe, it, expect, vi } from 'vitest';
import {
  tokenizeIntent,
  rankTools,
  matchIntent,
  registerIntentTools,
} from '../../src/tools/intent.js';
import type { IntentContext, MatchParams } from '../../src/tools/intent.js';
import { DISCOVER_TOOL, MATCH_TOOL, META_TOOLS } from '../../src/tools/catalog.js';
import type { CatalogTool } from '../../src/tools/catalog.js';
import { AiProviderNotConfiguredError } from '../../src/ai/provider.js';
import type { AiProvider } from '../../src/ai/provider.js';

function schema(...required: string[]): Record<string, unknown> {
  return { type: 'object', properties: {}, ...(required.length ? { required } : {}) };
}

/** A small but representative catalog; descriptions mirror the real English ones. */
const tools: Record<string, CatalogTool> = {
  list_skills: { description: 'List all skills' },
  list_prompts: { description: 'List all prompts' },
  get_prompt: { description: 'Get a prompt by id', inputSchema: schema('id') },
  create_prompt: { description: 'Create a new prompt', inputSchema: schema('name', 'content') },
  create_skill: { description: 'Create a new skill', inputSchema: schema('name', 'content') },
  delete_skill: { description: 'Delete a skill permanently', inputSchema: schema('id') },
  update_prompt: { description: 'Update prompt metadata', inputSchema: schema('id') },
  search_assets: { description: 'Full text search across assets', inputSchema: schema('query') },
  create_version_snapshot: { description: 'Create a version snapshot', inputSchema: schema('assetId') },
  list_versions: { description: 'List versions of an asset', inputSchema: schema('assetId') },
  rollback_to_version: { description: 'Rollback to a previous version', inputSchema: schema('assetId', 'version') },
  version_stats: { description: 'Get version statistics' },
  evaluation_summary: { description: 'Summarize evaluation scores', inputSchema: schema('setId') },
  compare_evaluation_sets: { description: 'Compare two evaluation sets', inputSchema: schema('baselineSetId', 'candidateSetId') },
  add_evaluation_samples: { description: 'Add evaluation samples in batch', inputSchema: schema('setId') },
  rate_evaluation_sample: { description: 'Rate one evaluation sample', inputSchema: schema('sampleId', 'score') },
  apply_evaluation_dsl: { description: 'Apply scoring DSL rules in batch', inputSchema: schema('setId') },
  ai_rate_evaluation_samples: { description: 'AI rate evaluation samples', inputSchema: schema('setId') },
  ai_rewrite_prompt: { description: 'AI rewrite a prompt based on weak samples', inputSchema: schema('setId') },
  apply_prompt_rewrite: { description: 'Apply a prompt rewrite and create a new version', inputSchema: schema('assetId') },
  'team.status': { description: 'Get team execution status', inputSchema: schema('sessionId') },
  [DISCOVER_TOOL]: { description: 'Browse tools by keyword or group' },
  [MATCH_TOOL]: { description: 'Route a natural-language intent to tools' },
};

const groups: Record<string, string> = {};
for (const name of Object.keys(tools)) {
  groups[name] = name.includes('.') ? name.split('.')[0]
    : name.startsWith('ai_') || name.startsWith('evaluation') || name.includes('evaluation') ? 'evaluations'
      : name.includes('version') || name === 'version_stats' ? 'versions'
        : META_TOOLS.includes(name) ? 'catalog' : 'assets';
}

const exposed = new Set(['list_prompts', 'list_skills', DISCOVER_TOOL, MATCH_TOOL]);

function context(overrides: Partial<IntentContext> = {}): IntentContext {
  return { tools, groups, exposed, providerFactory: () => undefined, ...overrides };
}

const rank = (intent: string, extra: Partial<MatchParams> = {}, ctx = context()) =>
  rankTools(ctx, { intent, limit: 5, ...extra });

describe('tokenizeIntent', () => {
  it('maps Chinese action and object words to canonical concepts', () => {
    const query = tokenizeIntent('帮我看看有哪些提示词');
    expect(query.concepts.has('list')).toBe(true);
    expect(query.concepts.has('prompt')).toBe(true);
    expect(query.concepts.has('delete')).toBe(false);
  });

  it('recognises multi-word English aliases and compact tool names', () => {
    expect(tokenizeIntent('roll back to the previous version').concepts.has('rollback')).toBe(true);
    const exact = tokenizeIntent('list_prompts');
    expect(exact.looksLikeToolName).toBe(true);
    expect(exact.compact).toBe('list_prompts');
    expect(tokenizeIntent('帮我看看有哪些提示词').looksLikeToolName).toBe(false);
  });
});

describe('rankTools', () => {
  it('routes common Chinese intents to the right tool', () => {
    expect(rank('帮我看看有哪些提示词')[0].name).toBe('list_prompts');
    expect(rank('新建一个技能')[0].name).toBe('create_skill');
    expect(rank('删除这个技能')[0].name).toBe('delete_skill');
    expect(rank('搜索包含 SQLite 的资产')[0].name).toBe('search_assets');
  });

  it('routes English intents and normalises stats/summary synonyms', () => {
    expect(rank('roll back to the previous version')[0].name).toBe('rollback_to_version');
    expect(rank('统计一下版本信息')[0].name).toBe('version_stats');
    expect(rank('list prompts')[0].name).toBe('list_prompts');
  });

  it('penalises contradictory actions', () => {
    const matches = rank('删除这个技能');
    const remove = matches.find(m => m.name === 'delete_skill');
    const create = matches.find(m => m.name === 'create_skill');
    expect(remove).toBeDefined();
    expect(remove?.reasons.some(r => r.includes('delete 命中工具名'))).toBe(true);
    expect(create).toBeUndefined();
  });

  it('boosts exact names and recovers from typos without dragging in unrelated tools', () => {
    expect(rank('list_prompts')[0]).toMatchObject({ name: 'list_prompts', confidence: 'high' });
    const typo = rank('list_promts');
    expect(typo[0].name).toBe('list_prompts');
    expect(typo[0].confidence).toBe('high');
    expect(typo[0].reasons.some(r => r.includes('名称相似度'))).toBe(true);
    expect(typo[0].score - typo[1].score).toBeGreaterThan(8);
  });

  it('returns empty for unrelated input and honours group / limit', () => {
    expect(rank('你好呀')).toEqual([]);
    expect(rank('评测', { group: 'versions' })).toEqual([]);
    expect(rank('版本', { group: 'versions' }).every(m => m.group === 'versions')).toBe(true);
    expect(rank('版本', { limit: 2 })).toHaveLength(2);
  });

  it('exposes match metadata, required fields and call templates', () => {
    const [best] = rank('get_prompt');
    expect(best.name).toBe('get_prompt');
    expect(best.required).toEqual(['id']);
    expect(best.missing).toEqual(['id']);
    expect(best.reasons.length).toBeGreaterThan(0);
    expect(best.exposed).toBe(false);
    expect(best.callTemplate).toEqual({ name: 'get_prompt', arguments: {} });
    expect(best.inputSchema).toBeUndefined();

    const withArgs = rank('get_prompt', { args: { id: 'abc' }, includeSchema: true })[0];
    expect(withArgs.missing).toEqual([]);
    expect(withArgs.callTemplate.arguments).toEqual({ id: 'abc' });
    expect(withArgs.inputSchema).toEqual(schema('id'));
  });
});

describe('matchIntent', () => {
  it('marks an unambiguous intent as auto-selected', async () => {
    const result = await matchIntent(context(), { intent: '列出所有提示词' });
    expect(result.engine).toBe('local');
    expect(result.autoSelect).toBe(true);
    expect(result.selected).toBe('list_prompts');
    expect(result.matches[0].confidence).not.toBe('low');
    expect(result.hint).toMatch(/hidden tools are callable/i);
  });

  it('keeps ambiguous intents unselected and returns several candidates', async () => {
    const result = await matchIntent(context(), { intent: '给评测集批量打分', limit: 3 });
    expect(result.autoSelect).toBe(false);
    expect(result.selected).toBeUndefined();
    expect(result.matches).toHaveLength(3);
    expect(result.matches.some(m => m.name.includes('evaluation'))).toBe(true);
  });

  it('rejects an empty intent', async () => {
    await expect(matchIntent(context(), { intent: '  ' })).rejects.toThrow(/non-empty `intent`/);
  });

  it('auto-executes only unambiguous read-only matches', async () => {
    const invoke = vi.fn(async () => ({ items: [] }));
    const result = await matchIntent(context({ invoke }), {
      intent: '列出所有提示词', execute: true,
    });
    expect(invoke).toHaveBeenCalledWith('list_prompts', {});
    expect(result.executed).toEqual({ name: 'list_prompts', args: {}, result: { items: [] } });
    expect(result.refused).toBeUndefined();
  });

  it('never auto-executes writes, unclear intents, meta tools or missing parameters', async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const cases: Array<[MatchParams, RegExp]> = [
      [{ intent: '新建一个技能', args: { name: 'x', content: 'y' }, execute: true }, /写操作/],
      [{ intent: '给评测集批量打分', execute: true }, /置信度不足/],
      [{ intent: 'discover_tools', execute: true }, /元工具/],
      [{ intent: 'get_prompt', execute: true }, /置信度不足|缺少必填参数/],
    ];
    for (const [params, pattern] of cases) {
      const result = await matchIntent(context({ invoke }), params);
      expect(result.refused).toMatch(pattern);
      expect(result.executed).toBeUndefined();
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it('captures executor failures without losing the ranking', async () => {
    const result = await matchIntent(context({
      invoke: async () => { throw new Error('db locked'); },
    }), { intent: '列出所有提示词', execute: true });
    expect(result.executed?.error).toBe('db locked');
    expect(result.matches[0].name).toBe('list_prompts');
  });

  it('requires a configured provider when useAi is requested', async () => {
    await expect(matchIntent(context(), { intent: '列出提示词', useAi: true }))
      .rejects.toBeInstanceOf(AiProviderNotConfiguredError);
  });

  it('applies an AI re-rank and falls back to local ranking on provider errors', async () => {
    const good: AiProvider = {
      execute: async () => ({ content: '```json\n{"ranked":["list_skills","list_prompts"],"reason":"skill first"}\n```' }),
    };
    const applied = await matchIntent(context({ provider: good }), { intent: '列出提示词', useAi: true, limit: 3 });
    expect(applied.aiRerank).toMatchObject({ status: 'applied', reason: 'skill first' });
    expect(applied.matches[0].name).toBe('list_skills');
    expect(applied.engine).toBe('local+ai');

    const broken: AiProvider = { execute: async () => { throw new Error('upstream 500'); } };
    const degraded = await matchIntent(context({ provider: broken }), { intent: '列出提示词', useAi: true });
    expect(degraded.aiRerank?.status).toBe('failed');
    expect(degraded.aiRerank?.error).toContain('upstream 500');
    expect(degraded.matches[0].name).toBe('list_prompts');
  });

  it('ignores hallucinated tool names from the AI response', async () => {
    const hallucinating: AiProvider = {
      execute: async () => ({ content: JSON.stringify({ ranked: ['not_a_real_tool'], reason: 'oops' }) }),
    };
    const result = await matchIntent(context({ provider: hallucinating }), { intent: '列出提示词', useAi: true });
    expect(result.aiRerank?.status).toBe('failed');
    expect(result.matches.every(m => m.name in tools)).toBe(true);
  });
});

describe('registerIntentTools', () => {
  it('registers exactly one always-available meta tool', async () => {
    const registered = registerIntentTools(context());
    expect(Object.keys(registered)).toEqual([MATCH_TOOL]);
    expect(registered.match_tools.inputSchema.required).toEqual(['intent']);

    const result = await registered.match_tools.handler({ intent: '新建一个技能' });
    expect(result.matches[0].name).toBe('create_skill');
  });
});
