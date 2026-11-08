import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CORE_TOOLS, DISCOVER_TOOL, MATCH_TOOL, META_TOOLS } from '../../src/tools/catalog.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distPath = path.resolve(projectRoot, 'dist/index.js');

function baseEnv(dir: string): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  delete env.AGENTX_TOOLS;
  delete env.AGENTX_ENHANCED;
  env.AGENTX_DIR = dir;
  return env;
}

async function withClient<T>(env: Record<string, string>, fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [distPath],
    env,
  });
  const client = new Client({ name: 'agentx-exposure-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

describe('MCP tool exposure', () => {
  let dir: string;

  beforeAll(() => {
    // The integration test runs against the built entry point; rebuild only if stale.
    if (!existsSync(distPath) || !readFileSync(distPath, 'utf8').includes('resolveExposure')) {
      execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
    }
    dir = mkdtempSync(path.join(tmpdir(), 'agentx-exposure-'));
    return () => rmSync(dir, { recursive: true, force: true });
  });

  it('exposes only the core set plus the meta tools by default', async () => {
    const names = await withClient(baseEnv(dir), async client => {
      const { tools } = await client.listTools();
      return tools.map(tool => tool.name);
    });

    expect(names).toHaveLength(CORE_TOOLS.length + META_TOOLS.length);
    expect(names).toContain(DISCOVER_TOOL);
    expect(names).toContain(MATCH_TOOL);
    expect(names).toContain('list_skills');
    expect(names).toContain('list_builtin_prompts');
    expect(names).toContain('get_builtin_prompt');
    expect(names).toContain('match_builtin_prompts');
    expect(names).toContain('update_prompt');
    expect(names).toContain('apply_evaluation_dsl');
    expect(names).not.toContain('update_skill');
    expect(names).not.toContain('apply_prompt_rewrite');
  }, 60000);

  it('exposes every registered tool with AGENTX_TOOLS=full', async () => {
    const names = await withClient({ ...baseEnv(dir), AGENTX_TOOLS: 'full' }, async client => {
      const { tools } = await client.listTools();
      return tools.map(tool => tool.name);
    });

    expect(names.length).toBeGreaterThan(CORE_TOOLS.length + META_TOOLS.length);
    expect(names).toContain('update_skill');
    expect(names).toContain('apply_evaluation_dsl');
    expect(names).toContain(DISCOVER_TOOL);
    expect(names).toContain(MATCH_TOOL);
  }, 60000);

  it('still lets clients call hidden tools and discover them by keyword', async () => {
    const result = await withClient(baseEnv(dir), async client => {
      const discovery = await client.callTool({ name: DISCOVER_TOOL, arguments: { query: 'rewrite' } });
      const hidden = await client.callTool({ name: 'version_stats', arguments: {} });
      return { discovery, hidden };
    });

    const discoveryText = JSON.stringify(result.discovery.content);
    expect(discoveryText).toContain('ai_rewrite_prompt');
    expect(discoveryText).toContain('Hidden tools stay callable');
    // A hidden tool is callable: it returns real data rather than "Unknown tool".
    expect(JSON.stringify(result.hidden.content)).not.toContain('Unknown tool');
  }, 60000);

  it('routes natural-language intents, auto-runs safe reads and suggests tools for typos', async () => {
    const result = await withClient(baseEnv(dir), async client => {
      const routed = await client.callTool({
        name: MATCH_TOOL,
        arguments: { intent: '给评测集批量打分', limit: 5 },
      });
      const readonly = await client.callTool({
        name: MATCH_TOOL,
        arguments: { intent: '列出所有提示词', execute: true },
      });
      const write = await client.callTool({
        name: MATCH_TOOL,
        arguments: { intent: '新建一个技能', args: { name: 'x', content: 'y' }, execute: true },
      });
      const unknown = await client.callTool({ name: 'list_promts', arguments: {} });
      return { routed, readonly, write, unknown };
    });

    const text = (r: typeof result.routed): string =>
      (r.content as Array<{ text: string }>)[0].text;
    const routed = JSON.parse(text(result.routed));
    expect(routed.matches.map((m: { name: string }) => m.name)).toContain('apply_evaluation_dsl');
    expect(routed.matches.some((m: { exposed: boolean }) => !m.exposed)).toBe(true);

    const readonly = JSON.parse(text(result.readonly));
    expect(readonly.executed?.name).toBe('list_prompts');

    const write = JSON.parse(text(result.write));
    expect(write.executed).toBeUndefined();
    expect(write.refused).toMatch(/写操作/);

    expect(text(result.unknown)).toContain('Intent routing suggests: list_prompts');
  }, 60000);

  it('reports a clear error when AI reranking is requested without a provider', async () => {
    const env = baseEnv(dir);
    delete env.AGENTX_AI_API_KEY;
    const result = await withClient(env, async client =>
      client.callTool({ name: MATCH_TOOL, arguments: { intent: '列出提示词', useAi: true } }));

    expect(JSON.stringify(result.content)).toContain('AI provider is not configured');
  }, 60000);
});
