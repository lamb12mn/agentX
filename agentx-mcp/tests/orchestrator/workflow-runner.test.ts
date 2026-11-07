import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/store/db.js';
import { createAsset } from '../../src/store/assets.js';
import {
  parseWorkflowConfig,
  executeWorkflowAsset,
} from '../../src/orchestrator/workflow-runner.js';
import type { ExecutionOptions } from '../../src/orchestrator/team-engine.js';
import type { AssetType } from '../../src/types.js';

const STEPS_YAML = 'steps:\n  - from: start\n    to: writer\n';

describe('workflow runner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-workflow-test-'));
    initDb(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function makeAsset(content: string, type: AssetType = 'workflow'): Promise<string> {
    const asset = await createAsset({ type, name: 'wf', tags: [] }, content, tmpDir);
    return asset.id;
  }

  // ── Config parsing ───────────────────────────────────────────────────────

  it('parses a full TeamConfig and keeps its agents', () => {
    const config = parseWorkflowConfig([
      'name: review-team',
      'version: 2.0.0',
      'agents:',
      '  - role: start',
      '    agent_ref: start-agent',
      '  - role: writer',
      '    agent_ref: writer-agent',
      'workflow:',
      '  - from: start',
      '    to: writer',
    ].join('\n'));

    expect(config.name).toBe('review-team');
    expect(config.version).toBe('2.0.0');
    expect(config.agents.map(a => a.role)).toEqual(['start', 'writer']);
    expect(config.workflow).toHaveLength(1);
  });

  it('accepts a { steps } mapping and synthesises one agent per role', () => {
    const config = parseWorkflowConfig(STEPS_YAML, 'fallback-name');
    expect(config.name).toBe('fallback-name');
    expect(config.version).toBe('1.0.0');
    expect(config.agents.map(a => a.role)).toEqual(['start', 'writer']);
    expect(config.agents[0].agent_ref).toBe('start');
  });

  it('accepts a bare top-level step list (and JSON, which is valid YAML)', () => {
    const config = parseWorkflowConfig('[{"from":"a","to":"b"},{"from":"b","to":"c"}]');
    expect(config.agents.map(a => a.role)).toEqual(['a', 'b', 'c']);
    expect(config.workflow).toHaveLength(2);
  });

  it('rejects malformed YAML, empty step lists and incomplete steps', () => {
    expect(() => parseWorkflowConfig('name: [unclosed')).toThrow(/Invalid workflow YAML/);
    expect(() => parseWorkflowConfig('name: empty\nworkflow: []')).toThrow(/non-empty/);
    expect(() => parseWorkflowConfig('steps:\n  - from: a\n')).toThrow(/"from" and "to"/);
    expect(() => parseWorkflowConfig('just a string')).toThrow(/mapping or a list/);
  });

  // ── Execution ────────────────────────────────────────────────────────────

  const handler: ExecutionOptions['agentHandler'] = async (agent, input) => ({
    role: agent.role,
    agentRef: agent.agent_ref,
    status: 'completed',
    input,
    output: { handledBy: agent.role },
    retries: 0,
  });

  it('executes a stored workflow with an injected handler and returns the full result', async () => {
    const id = await makeAsset(STEPS_YAML);
    const result = await executeWorkflowAsset(id, { topic: 'SQLite' }, { agentHandler: handler });

    expect(result.status).toBe('completed');
    expect(result.simulated).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].output).toMatchObject({ handledBy: 'writer' });
    expect(result.aggregatedOutput).toMatchObject({ topic: 'SQLite' });
    expect(result.sessionId).toBeTruthy();
    expect(result.errors).toEqual([]);
  });

  it('marks the run as simulated when no provider or handler is supplied', async () => {
    const id = await makeAsset(STEPS_YAML);
    const result = await executeWorkflowAsset(id);
    expect(result.status).toBe('completed');
    expect(result.simulated).toBe(true);
    expect(result.steps[0].output).toMatchObject({ simulated: true });
  });

  it('uses a real provider when one is injected', async () => {
    const id = await makeAsset(STEPS_YAML);
    const provider = {
      execute: async () => ({ content: '{"answer":"done"}' }),
    };
    const result = await executeWorkflowAsset(id, {}, { aiProvider: provider });
    expect(result.simulated).toBe(false);
    expect(result.steps[0].output).toMatchObject({ answer: 'done' });
  });

  it('validates workflowId, existence and asset type', async () => {
    await expect(executeWorkflowAsset('')).rejects.toThrow(/workflowId/);
    await expect(executeWorkflowAsset('does-not-exist')).rejects.toThrow(/Workflow not found/);

    const promptId = await makeAsset('hello', 'prompt');
    await expect(executeWorkflowAsset(promptId)).rejects.toThrow(/not a workflow/);

    const badId = await makeAsset('workflow: []');
    await expect(executeWorkflowAsset(badId)).rejects.toThrow(/non-empty/);
  });
});
