import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/store/db';
import { registerAgentTools } from '../../src/tools/agents';
import type { AgentConfig } from '../../src/types';

const sampleConfig: AgentConfig = {
  name: 'my-agent',
  version: '1.0.0',
  description: 'Test agent',
  role_prompt: 'You are a test agent.',
  rules: ['rule-1'],
  skills: ['skill-a'],
  mcps: [{ name: 'some-mcp', command: 'npx', args: ['-y', 'mcp'], enabled: true }],
  workflow: undefined,
};

describe('agent tools', () => {
  let tmpDir: string;
  let tools: ReturnType<typeof registerAgentTools>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-agents-test-'));
    initDb(join(tmpDir, 'test.db'));
    tools = registerAgentTools(tmpDir);
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('list_agents returns empty array initially', async () => {
    const result = await tools.list_agents.handler({});
    expect(result).toEqual([]);
  });

  it('create_agent creates an agent and returns metadata', async () => {
    const result = await tools.create_agent.handler({
      name: 'my-agent',
      config: sampleConfig,
    });
    expect(result.name).toBe('my-agent');
    expect(result.type).toBe('agent');
    expect(result.id).toBeTruthy();
  });

  it('get_agent returns agent with parsed config', async () => {
    const created = await tools.create_agent.handler({
      name: 'my-agent',
      config: sampleConfig,
    });
    const result = await tools.get_agent.handler({ id: created.id });
    expect(result).not.toBeNull();
    expect(result!.meta.name).toBe('my-agent');
    expect(result!.config.version).toBe('1.0.0');
    expect(result!.config.rules).toEqual(['rule-1']);
    expect(result!.config.skills).toEqual(['skill-a']);
  });

  it('list_agents returns created agents', async () => {
    await tools.create_agent.handler({ name: 'agent-1', config: { ...sampleConfig, name: 'agent-1' } });
    await tools.create_agent.handler({ name: 'agent-2', config: { ...sampleConfig, name: 'agent-2' } });
    const list = await tools.list_agents.handler({});
    expect(list).toHaveLength(2);
  });

  it('update_agent updates the agent', async () => {
    const created = await tools.create_agent.handler({ name: 'my-agent', config: sampleConfig });
    const updated = await tools.update_agent.handler({ id: created.id, name: 'renamed-agent' });
    expect(updated.name).toBe('renamed-agent');
  });

  it('delete_agent removes the agent', async () => {
    const created = await tools.create_agent.handler({ name: 'my-agent', config: sampleConfig });
    await tools.delete_agent.handler({ id: created.id });
    const fetched = await tools.get_agent.handler({ id: created.id });
    expect(fetched).toBeNull();
  });

  it('export_agent exports to CLAUDE.md and settings.json', async () => {
    const created = await tools.create_agent.handler({ name: 'my-agent', config: sampleConfig });
    const outputDir = join(tmpDir, 'export-out');
    const result = await tools.export_agent.handler({ id: created.id, output_dir: outputDir });
    expect(existsSync(result.claude_md_path)).toBe(true);
    expect(existsSync(result.settings_json_path)).toBe(true);
  });
});
