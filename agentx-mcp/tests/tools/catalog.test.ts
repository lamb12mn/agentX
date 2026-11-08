import { describe, it, expect } from 'vitest';
import {
  CORE_TOOLS,
  DISCOVER_TOOL,
  resolveExposure,
  searchCatalog,
  registerCatalogTools,
} from '../../src/tools/catalog.js';
import type { CatalogTool } from '../../src/tools/catalog.js';

const available = [
  ...CORE_TOOLS,
  'update_skill', 'delete_skill', 'apply_evaluation_dsl', 'ai_rewrite_prompt',
  'team.create', 'vault.get', DISCOVER_TOOL,
];

const groups: Record<string, string> = {};
for (const name of available) {
  groups[name] = name.includes('.')
    ? name.split('.')[0]
    : (name.startsWith('ai_') ? 'evaluations' : 'skills');
}

const tools: Record<string, CatalogTool> = {};
for (const name of available) {
  tools[name] = { description: `Tool ${name}`, inputSchema: { type: 'object' } };
}

describe('tool exposure', () => {
  it('defaults to the core set and never lists discover_tools twice', () => {
    const result = resolveExposure(available);
    expect(result.profile).toBe('core');
    expect(result.exposed).toEqual([...CORE_TOOLS]);
    expect(result.exposed).not.toContain(DISCOVER_TOOL);
    expect(result.warnings).toEqual([]);
  });

  it('full exposes every registered tool', () => {
    const result = resolveExposure(available, 'full');
    expect(result.profile).toBe('full');
    expect(new Set(result.exposed)).toEqual(new Set(available.filter(n => n !== DISCOVER_TOOL)));
  });

  it('supports a custom whitelist and core plus extras', () => {
    const custom = resolveExposure(available, 'update_skill,team.create');
    expect(custom.profile).toBe('custom');
    expect(custom.exposed).toEqual(['update_skill', 'team.create']);

    const extended = resolveExposure(available, 'core, ai_rewrite_prompt, update_skill');
    expect(extended.exposed).toEqual([...CORE_TOOLS, 'ai_rewrite_prompt', 'update_skill']);
  });

  it('de-duplicates, ignores discover_tools and warns on unknown names', () => {
    const result = resolveExposure(available, 'core,core,update_skill,nope,discover_tools');
    expect(result.exposed.filter(n => n === 'update_skill')).toHaveLength(1);
    expect(result.exposed).not.toContain(DISCOVER_TOOL);
    expect(result.warnings).toEqual(['Unknown tool in AGENTX_TOOLS: nope']);
  });
});

describe('tool catalog', () => {
  const exposed = new Set<string>([...CORE_TOOLS, DISCOVER_TOOL]);

  it('reports group overview and marks hidden tools without schemas by default', () => {
    const result = searchCatalog(tools, groups, exposed, 'core', {});
    expect(result.totalTools).toBe(available.length);
    expect(result.exposedCount).toBe(CORE_TOOLS.length + 1);
    expect(result.profile).toBe('core');
    const hidden = result.tools.find(t => t.name === 'ai_rewrite_prompt');
    expect(hidden?.exposed).toBe(false);
    expect(hidden?.inputSchema).toBeUndefined();
    expect(result.hint).toMatch(/Hidden tools stay callable/);
  });

  it('filters by query, group, limit and optional schema', () => {
    const byQuery = searchCatalog(tools, groups, exposed, 'core', { query: 'rewrite' });
    expect(byQuery.tools.map(t => t.name)).toEqual(['ai_rewrite_prompt']);

    const byGroup = searchCatalog(tools, groups, exposed, 'core', { group: 'evaluations' });
    expect(byGroup.tools.map(t => t.name)).toContain('ai_rewrite_prompt');
    expect(byGroup.tools.every(t => t.group === 'evaluations')).toBe(true);

    expect(searchCatalog(tools, groups, exposed, 'core', { limit: 2 }).tools).toHaveLength(2);

    const withSchema = searchCatalog(tools, groups, exposed, 'core', {
      query: 'rewrite', includeSchema: true,
    });
    expect(withSchema.tools[0].inputSchema).toEqual({ type: 'object' });

    const badLimit = searchCatalog(tools, groups, exposed, 'core', { limit: 999 });
    expect(badLimit.tools.length).toBeLessThanOrEqual(30);
  });

  it('registers exactly one always-available discovery tool', async () => {
    const registered = registerCatalogTools({ tools, groups, exposed, profile: 'core' });
    expect(Object.keys(registered)).toEqual([DISCOVER_TOOL]);
    expect(registered.discover_tools.inputSchema).toHaveProperty('properties.group');

    const result = await registered.discover_tools.handler({ query: 'vault' });
    expect(result.tools.map(t => t.name)).toEqual(['vault.get']);
    expect(result.groups.find(g => g.name === 'vault')).toMatchObject({ total: 1, exposed: 0 });
  });
});
