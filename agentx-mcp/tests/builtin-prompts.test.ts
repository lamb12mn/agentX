import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../src/store/db.js';
import { updateAsset, deleteAsset } from '../src/store/assets.js';
import {
  AUTO_MATCH_MIN_SCORE,
  BUILTIN_ID_PREFIX,
  assertNotBuiltin,
  autoMatchBuiltin,
  builtinStats,
  getBuiltinPrompt,
  isBuiltinId,
  listBuiltinPrompts,
  matchBuiltinPrompts,
} from '../src/builtin-prompts/library.js';
import { registerBuiltinPromptTools } from '../src/tools/builtin-prompts.js';
import { registerPromptTools } from '../src/tools/prompts.js';
import { registerRuleTools } from '../src/tools/rules.js';
import { registerAgentTools } from '../src/tools/agents.js';

const CAPTURE_PATH = join(process.cwd(), 'src/builtin-prompts/garden-prompts.json');

describe('immutable built-in prompt library', () => {
  it('contains every captured prompt with verbatim, untruncated text', () => {
    const raw = JSON.parse(readFileSync(CAPTURE_PATH, 'utf-8'));
    const items = listBuiltinPrompts();
    const stats = builtinStats();

    expect(items).toHaveLength(147);
    expect(stats.expected).toBe(147);
    expect(stats.total).toBe(raw.items.length);
    expect(stats.captureErrors).toBe(0);
    expect(stats.byType).toEqual({ text: 25, image: 122 });
    expect(stats.promptTextChars).toBe(135932);
    expect(new Set(items.map((item) => item.id)).size).toBe(147);
    expect(items.every((item) => item.promptText.length > 0)).toBe(true);

    for (const source of raw.items) {
      const item = getBuiltinPrompt(BUILTIN_ID_PREFIX + source.id);
      expect(item).toBeDefined();
      expect(item!.promptText).toBe(source.promptText);
      expect(item!.notes).toBe(source.notes);
      expect(item!.title).toBe(source.title);
      expect(item!.tags).toEqual(source.tags ?? []);
    }

    const longest = [...items].sort((a, b) => b.promptText.length - a.promptText.length)[0];
    expect(longest.promptText.length).toBeGreaterThan(5000);
    expect(longest.promptText).not.toContain('[truncated]');
  });

  it('is deeply frozen in memory', () => {
    const item = getBuiltinPrompt(listBuiltinPrompts()[0].id)!;
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(item.tags)).toBe(true);
    expect(() => {
      (item as unknown as { title: string }).title = 'tampered';
    }).toThrow();
    expect(item.title).not.toBe('tampered');
  });

  it('refuses update/delete of built-ins at the store layer', async () => {
    const first = listBuiltinPrompts()[0];
    expect(isBuiltinId(first.id)).toBe(true);
    expect(isBuiltinId(first.sourceId)).toBe(true);
    expect(() => assertNotBuiltin(first.id)).toThrow(/read-only/);

    await expect(updateAsset(first.id, { description: 'tampered' })).rejects.toThrow(/read-only/);
    await expect(deleteAsset(first.id)).rejects.toThrow(/read-only/);
    await expect(deleteAsset(listBuiltinPrompts()[1].sourceId)).rejects.toThrow(/read-only/);
    await expect(deleteAsset(BUILTIN_ID_PREFIX + 'unknown-id')).rejects.toThrow(/read-only/);
  });

  it('exposes read-only MCP tools and matches intents locally', async () => {
    const tools = registerBuiltinPromptTools();

    const listed = await tools.list_builtin_prompts.handler({ limit: 3 });
    expect(listed.stats.total).toBe(147);
    expect(listed.returned).toBe(3);
    expect(listed.items[0].promptTextLength).toBeGreaterThan(0);

    const matched = await tools.match_builtin_prompts.handler({
      query: '运煤问题 第一天 第二天 拉走多少煤',
      limit: 3,
    });
    expect(matched.matches.length).toBeGreaterThan(0);
    expect(matched.matches[0].title).toContain('运煤');
    expect(matched.selected).toBeTruthy();
    expect(matched.reference).toContain('## 内置参考提示词（只读）');

    const full = await tools.get_builtin_prompt.handler({ id: matched.selected! });
    expect(full.item?.promptText).toContain('有一堆煤');
    expect(full.item?.promptText).toBe(getBuiltinPrompt(matched.selected!)?.promptText);

    expect(matchBuiltinPrompts('把复杂内容讲成白话', { limit: 1 })[0]).toBeDefined();
    expect(await tools.get_builtin_prompt.handler({ id: 'not-a-real-prompt' })).toEqual({
      item: null,
      reference: null,
    });
  });

  it('filters by subcategory path, not just the top-level category', async () => {
    expect(matchBuiltinPrompts('网站 mockup UI 设计', { category: '视觉方案', limit: 3 }).length)
      .toBeGreaterThan(0);

    const tools = registerBuiltinPromptTools();
    const listed = await tools.list_builtin_prompts.handler({ category: '视觉方案' });
    expect(listed.returned).toBeGreaterThan(0);
  });

  it('rejects weak intent matches instead of copying an unrelated built-in prompt', () => {
    expect(AUTO_MATCH_MIN_SCORE).toBe(25);
    expect(autoMatchBuiltin('全能 UI 设计师')).toBeNull();
    expect(autoMatchBuiltin('把复杂内容讲成白话')?.id).toBe('builtin:plain-language-explainer');
  });
});

describe('automatic built-in prompt invocation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-builtin-test-'));
    initDb(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('create_prompt applies the matched built-in prompt when only intent is given', async () => {
    const tools = registerPromptTools(tmpDir);
    const meta = await tools.create_prompt.handler({ name: 'auto-prompt', intent: '运煤问题' });

    expect(meta.matchedBuiltin?.title).toContain('运煤');
    const loaded = await tools.get_prompt.handler({ id: meta.id });
    expect(loaded!.content).toBe(getBuiltinPrompt(meta.matchedBuiltin!.id)!.promptText);
  });

  it('update_prompt auto-appends the matched built-in reference when optimizing', async () => {
    const tools = registerPromptTools(tmpDir);
    const created = await tools.create_prompt.handler({ name: 'draft', content: '原始草稿内容' });

    const updated = await tools.update_prompt.handler({
      id: created.id,
      optimizeIntent: '把复杂内容讲成白话',
    });
    expect(updated.matchedBuiltin).toBeTruthy();

    const loaded = await tools.get_prompt.handler({ id: created.id });
    expect(loaded!.content).toContain('原始草稿内容');
    expect(loaded!.content).toContain('## 内置参考提示词（只读）');
    expect(loaded!.content).toContain(getBuiltinPrompt(updated.matchedBuiltin!.id)!.promptText);
  });

  it('create_rule and create_agent auto-apply matched built-in prompts', async () => {
    const rules = registerRuleTools(tmpDir);
    const rule = await rules.create_rule.handler({ name: 'auto-rule', intent: '把复杂内容讲成白话' });
    expect(rule.matchedBuiltin).toBeTruthy();
    const ruleLoaded = await rules.get_rule.handler({ id: rule.id });
    expect(ruleLoaded!.content).toBe(getBuiltinPrompt(rule.matchedBuiltin!.id)!.promptText);

    const agents = registerAgentTools(tmpDir);
    const agent = await agents.create_agent.handler({
      name: 'auto-agent',
      config: { name: 'auto-agent', version: '1.0.0', rules: [], skills: [], mcps: [] },
      intent: '运煤问题',
    });
    expect(agent.matchedBuiltin).toBeTruthy();
    const agentLoaded = await agents.get_agent.handler({ id: agent.id });
    expect(agentLoaded!.config.role_prompt).toContain('有一堆煤');
  });

  it('explicit content still wins over automatic matching', async () => {
    const tools = registerPromptTools(tmpDir);
    const meta = await tools.create_prompt.handler({
      name: 'explicit',
      content: 'my own content',
      intent: '运煤问题',
    });
    expect(meta.matchedBuiltin).toBeUndefined();
    const loaded = await tools.get_prompt.handler({ id: meta.id });
    expect(loaded!.content).toBe('my own content');
  });

  it('refuses to auto-apply a weak match when only intent is given', async () => {
    const tools = registerPromptTools(tmpDir);
    await expect(
      tools.create_prompt.handler({ name: 'weak-intent', intent: '全能 UI 设计师' }),
    ).rejects.toThrow(/No reliable built-in prompt match/);
  });
});
