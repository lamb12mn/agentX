import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/store/db.js';
import { registerTeamTools } from '../../src/tools/teams.js';
import type { TeamConfig } from '../../src/types.js';

function makeTeamConfig(overrides?: Partial<TeamConfig>): TeamConfig {
  return {
    name: 'test-team',
    version: '1.0.0',
    description: 'A test team',
    agents: [
      { role: 'researcher', agent_ref: 'researcher-agent', required: true },
      { role: 'writer', agent_ref: 'writer-agent', required: true },
    ],
    workflow: [
      { from: 'researcher', to: 'writer' },
    ],
    ...overrides,
  };
}

describe('team tools', () => {
  let tmpDir: string;
  let tools: ReturnType<typeof registerTeamTools>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-teams-test-'));
    initDb(join(tmpDir, 'test.db'));
    tools = registerTeamTools(tmpDir);
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── team.create ──────────────────────────────────────────────────────────

  it('team.create creates a team asset and returns metadata', async () => {
    const result = await tools['team.create'].handler({
      name: 'my-team',
      config: makeTeamConfig({ name: 'my-team' }),
      description: 'A test team',
      tags: ['test'],
    });
    expect(result).toHaveProperty('id');
    expect(result.name).toBe('my-team');
    expect(result.type).toBe('team');
    expect(result.description).toBe('A test team');
    expect(result.tags).toEqual(['test']);
  });

  it('team.create uses default tags when none provided', async () => {
    const result = await tools['team.create'].handler({
      name: 'no-tags',
      config: makeTeamConfig({ name: 'no-tags' }),
    });
    expect(result.tags).toEqual(['team']);
  });

  it('team.create syncs config.name with asset name', async () => {
    const result = await tools['team.create'].handler({
      name: 'asset-name',
      config: makeTeamConfig({ name: 'config-name' }),
    });
    expect(result.name).toBe('asset-name');
  });

  it('team.create throws on invalid config (missing agents)', async () => {
    await expect(
      tools['team.create'].handler({
        name: 'bad-team',
        config: makeTeamConfig({ agents: [] }),
      }),
    ).rejects.toThrow('at least one agent');
  });

  it('team.create throws on invalid config (unknown role in workflow)', async () => {
    await expect(
      tools['team.create'].handler({
        name: 'bad-workflow',
        config: makeTeamConfig({
          workflow: [{ from: 'researcher', to: 'unknown' }],
        }),
      }),
    ).rejects.toThrow('unknown role');
  });

  it('team.create stores config as JSON content', async () => {
    const result = await tools['team.create'].handler({
      name: 'json-store',
      config: makeTeamConfig({ name: 'json-store' }),
    });
    const { readAssetContent } = await import('../../src/store/assets.js');
    const content = await readAssetContent(result.id);
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('name', 'json-store');
    expect(parsed.agents).toHaveLength(2);
  });

  // ── team.list ────────────────────────────────────────────────────────────

  it('team.list returns empty array initially', async () => {
    const result = await tools['team.list'].handler({});
    expect(result).toEqual([]);
  });

  it('team.list returns created teams', async () => {
    await tools['team.create'].handler({
      name: 'team-a',
      config: makeTeamConfig({ name: 'team-a' }),
    });
    await tools['team.create'].handler({
      name: 'team-b',
      config: makeTeamConfig({ name: 'team-b' }),
    });
    const result = await tools['team.list'].handler({});
    expect(result).toHaveLength(2);
  });

  // ── team.run ─────────────────────────────────────────────────────────────

  it('team.run executes a team and returns result', async () => {
    const created = await tools['team.create'].handler({
      name: 'runnable',
      config: makeTeamConfig({ name: 'runnable' }),
    });
    const result = await tools['team.run'].handler({ id: created.id });

    expect(result).toHaveProperty('sessionId');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('steps');
    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(1);
  });

  it('team.run passes input to the workflow', async () => {
    const created = await tools['team.create'].handler({
      name: 'with-input',
      config: makeTeamConfig({ name: 'with-input' }),
    });
    const result = await tools['team.run'].handler({
      id: created.id,
      input: { topic: 'AI agents' },
    });

    expect(result.aggregatedOutput).toHaveProperty('topic', 'AI agents');
  });

  it('team.run throws for non-existent team', async () => {
    await expect(
      tools['team.run'].handler({ id: 'nonexistent-id' }),
    ).rejects.toThrow('Team not found');
  });

  it('team.run executes multi-step workflow in order', async () => {
    const created = await tools['team.create'].handler({
      name: 'multi-step',
      config: makeTeamConfig({
        name: 'multi-step',
        agents: [
          { role: 'researcher', agent_ref: 'r-agent', required: true },
          { role: 'writer', agent_ref: 'w-agent', required: true },
          { role: 'reviewer', agent_ref: 'rv-agent', required: false },
        ],
        workflow: [
          { from: 'researcher', to: 'writer' },
          { from: 'writer', to: 'reviewer' },
        ],
      }),
    });
    const result = await tools['team.run'].handler({ id: created.id });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].role).toBe('writer');
    expect(result.steps[1].role).toBe('reviewer');
  });

  // ── team.status ──────────────────────────────────────────────────────────

  it('team.status returns status for a completed execution', async () => {
    const created = await tools['team.create'].handler({
      name: 'status-test',
      config: makeTeamConfig({ name: 'status-test' }),
    });
    const runResult = await tools['team.run'].handler({ id: created.id });

    const status = await tools['team.status'].handler({ sessionId: runResult.sessionId });
    expect(status).toHaveProperty('sessionId', runResult.sessionId);
    expect(status).toHaveProperty('status', 'completed');
    expect(status).toHaveProperty('teamName', 'status-test');
    expect(status).toHaveProperty('progress', 100);
  });

  it('team.status throws for unknown session', async () => {
    await expect(
      tools['team.status'].handler({ sessionId: 'nonexistent-session' }),
    ).rejects.toThrow('Session not found');
  });

  // ── team.results ─────────────────────────────────────────────────────────

  it('team.results returns full results for a completed execution', async () => {
    const created = await tools['team.create'].handler({
      name: 'results-test',
      config: makeTeamConfig({ name: 'results-test' }),
    });
    const runResult = await tools['team.run'].handler({ id: created.id });

    const results = await tools['team.results'].handler({ sessionId: runResult.sessionId });
    expect(results).toHaveProperty('sessionId', runResult.sessionId);
    expect(results).toHaveProperty('status', 'completed');
    expect(results).toHaveProperty('steps');
    expect(results).toHaveProperty('aggregatedOutput');
    expect(results).toHaveProperty('totalDurationMs');
    expect(results).toHaveProperty('errors');
  });

  it('team.results throws for unknown session', async () => {
    await expect(
      tools['team.results'].handler({ sessionId: 'nonexistent-session' }),
    ).rejects.toThrow('Session not found');
  });

  // ── team.cancel ──────────────────────────────────────────────────────────

  it('team.cancel returns success for a known session', async () => {
    const created = await tools['team.create'].handler({
      name: 'cancel-test',
      config: makeTeamConfig({ name: 'cancel-test' }),
    });
    const runResult = await tools['team.run'].handler({ id: created.id });

    const result = await tools['team.cancel'].handler({ sessionId: runResult.sessionId });
    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('sessionId', runResult.sessionId);
  });

  it('team.cancel returns false for unknown session', async () => {
    const result = await tools['team.cancel'].handler({ sessionId: 'nonexistent-session' });
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('sessionId', 'nonexistent-session');
  });
});
