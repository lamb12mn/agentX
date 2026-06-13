import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { exportAgent } from '../../src/export/claude.js';
import type { AgentConfig } from '../../src/types.js';

describe('exportAgent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-export-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const baseConfig: AgentConfig = {
    name: 'test-agent',
    version: '1.0.0',
    description: 'A test agent',
    role_prompt: 'You are a helpful assistant.',
    rules: ['rule-1', 'rule-2'],
    skills: ['skill-a', 'skill-b'],
    mcps: [
      { name: 'enabled-mcp', command: 'npx', args: ['-y', 'some-mcp'], env: { KEY: 'val' }, enabled: true },
      { name: 'disabled-mcp', command: 'npx', args: ['-y', 'other-mcp'], enabled: false },
    ],
    workflow: undefined,
  };

  it('returns correct file paths', async () => {
    const result = await exportAgent(baseConfig, tmpDir);
    expect(result.claude_md_path).toBe(join(tmpDir, 'CLAUDE.md'));
    expect(result.settings_json_path).toBe(join(tmpDir, 'settings.json'));
  });

  it('exports CLAUDE.md with agent name', async () => {
    await exportAgent(baseConfig, tmpDir);
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('test-agent');
  });

  it('exports CLAUDE.md with description', async () => {
    await exportAgent(baseConfig, tmpDir);
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('A test agent');
  });

  it('exports CLAUDE.md with role_prompt', async () => {
    await exportAgent(baseConfig, tmpDir);
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('You are a helpful assistant.');
  });

  it('exports CLAUDE.md with rules list', async () => {
    await exportAgent(baseConfig, tmpDir);
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('rule-1');
    expect(content).toContain('rule-2');
  });

  it('exports CLAUDE.md with skills list', async () => {
    await exportAgent(baseConfig, tmpDir);
    const content = readFileSync(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('skill-a');
    expect(content).toContain('skill-b');
  });

  it('exports settings.json with enabled MCPs only', async () => {
    await exportAgent(baseConfig, tmpDir);
    const settings = JSON.parse(readFileSync(join(tmpDir, 'settings.json'), 'utf-8'));
    expect(settings.mcpServers).toHaveProperty('enabled-mcp');
    expect(settings.mcpServers).not.toHaveProperty('disabled-mcp');
  });

  it('exports settings.json with correct MCP command and args', async () => {
    await exportAgent(baseConfig, tmpDir);
    const settings = JSON.parse(readFileSync(join(tmpDir, 'settings.json'), 'utf-8'));
    expect(settings.mcpServers['enabled-mcp'].command).toBe('npx');
    expect(settings.mcpServers['enabled-mcp'].args).toEqual(['-y', 'some-mcp']);
    expect(settings.mcpServers['enabled-mcp'].env).toEqual({ KEY: 'val' });
  });

  it('exports settings.json with empty mcpServers when no enabled MCPs', async () => {
    const config: AgentConfig = { ...baseConfig, mcps: [] };
    await exportAgent(config, tmpDir);
    const settings = JSON.parse(readFileSync(join(tmpDir, 'settings.json'), 'utf-8'));
    expect(settings.mcpServers).toEqual({});
  });
});
