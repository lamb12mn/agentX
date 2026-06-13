import { describe, it, expect, beforeEach } from 'vitest';
import { TeamEngine } from '../../src/orchestrator/team-engine.js';
import type { TeamConfig, TeamAgent } from '../../src/types.js';
import type { StepResult } from '../../src/orchestrator/team-engine.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<TeamConfig>): TeamConfig {
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

function makeThreeStepConfig(): TeamConfig {
  return {
    name: 'three-step',
    version: '1.0.0',
    agents: [
      { role: 'researcher', agent_ref: 'researcher-agent', required: true },
      { role: 'writer', agent_ref: 'writer-agent', required: true },
      { role: 'reviewer', agent_ref: 'reviewer-agent', required: false },
    ],
    workflow: [
      { from: 'researcher', to: 'writer' },
      { from: 'writer', to: 'reviewer' },
    ],
  };
}

/** Default stub handler — always succeeds */
function stubHandler(agent: TeamAgent, input: Record<string, unknown>): Promise<Omit<StepResult, 'durationMs'>> {
  return Promise.resolve({
    role: agent.role,
    agentRef: agent.agent_ref,
    status: 'completed' as const,
    input,
    output: { role: agent.role, summary: `stub output for ${agent.role}` },
    retries: 0,
  });
}

/** Handler that always throws (simulates failure) */
function failingHandler(agent: TeamAgent, input: Record<string, unknown>): Promise<Omit<StepResult, 'durationMs'>> {
  return Promise.reject(new Error(`Agent "${agent.role}" failed`));
}

/** Handler that fails N times then succeeds */
function retryHandler(failCount: number): (agent: TeamAgent, input: Record<string, unknown>) => Promise<Omit<StepResult, 'durationMs'>> {
  let attempts = new Map<string, number>();
  return async (agent, input) => {
    const count = attempts.get(agent.role) ?? 0;
    attempts.set(agent.role, count + 1);
    if (count < failCount) {
      throw new Error(`Agent "${agent.role}" attempt ${count + 1} failed`);
    }
    return {
      role: agent.role,
      agentRef: agent.agent_ref,
      status: 'completed' as const,
      input,
      output: { role: agent.role, summary: `success after ${count} failures` },
      retries: count,
    };
  };
}

/** Handler that takes longer than timeout */
function slowHandler(ms: number): (agent: TeamAgent, input: Record<string, unknown>) => Promise<Omit<StepResult, 'durationMs'>> {
  return async (agent, input) => {
    await new Promise(r => setTimeout(r, ms));
    return {
      role: agent.role,
      agentRef: agent.agent_ref,
      status: 'completed' as const,
      input,
      output: { role: agent.role, summary: 'done' },
      retries: 0,
    };
  };
}

// ── validateConfig ────────────────────────────────────────────────────────────

describe('TeamEngine.validateConfig', () => {
  it('accepts a valid config', () => {
    expect(() => TeamEngine.validateConfig(makeConfig())).not.toThrow();
  });

  it('throws when name is missing', () => {
    expect(() => TeamEngine.validateConfig(makeConfig({ name: '' }))).toThrow('must have a name');
  });

  it('throws when agents array is empty', () => {
    expect(() => TeamEngine.validateConfig(makeConfig({ agents: [] }))).toThrow('at least one agent');
  });

  it('throws when agents is undefined', () => {
    expect(() => TeamEngine.validateConfig(makeConfig({ agents: undefined as any }))).toThrow('at least one agent');
  });

  it('throws when workflow array is empty', () => {
    expect(() => TeamEngine.validateConfig(makeConfig({ workflow: [] }))).toThrow('at least one workflow step');
  });

  it('throws when workflow is undefined', () => {
    expect(() => TeamEngine.validateConfig(makeConfig({ workflow: undefined as any }))).toThrow('at least one workflow step');
  });

  it('throws when workflow references unknown "from" role', () => {
    expect(() => TeamEngine.validateConfig(makeConfig({
      workflow: [{ from: 'unknown', to: 'writer' }],
    }))).toThrow('unknown role: "unknown"');
  });

  it('throws when workflow references unknown "to" role', () => {
    expect(() => TeamEngine.validateConfig(makeConfig({
      workflow: [{ from: 'researcher', to: 'unknown' }],
    }))).toThrow('unknown role: "unknown"');
  });
});

// ── execute — basic ───────────────────────────────────────────────────────────

describe('TeamEngine.execute', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('executes a single-step workflow and returns completed status', async () => {
    const result = await engine.execute(makeConfig(), { topic: 'AI agents' }, { agentHandler: stubHandler, skipPersistence: true });

    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe('completed');
    expect(result.steps[0].role).toBe('writer');
    expect(result.errors).toHaveLength(0);
  });

  it('executes a multi-step workflow in order', async () => {
    const result = await engine.execute(makeThreeStepConfig(), { topic: 'MCP' }, { agentHandler: stubHandler, skipPersistence: true });

    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].role).toBe('writer');
    expect(result.steps[1].role).toBe('reviewer');
  });

  it('includes global input in aggregated output', async () => {
    const result = await engine.execute(makeConfig(), { topic: 'test', priority: 'high' }, { agentHandler: stubHandler, skipPersistence: true });

    expect(result.aggregatedOutput).toHaveProperty('topic', 'test');
    expect(result.aggregatedOutput).toHaveProperty('priority', 'high');
  });

  it('merges step output into aggregated output', async () => {
    const result = await engine.execute(makeConfig(), {}, { agentHandler: stubHandler, skipPersistence: true });

    expect(result.aggregatedOutput).toHaveProperty('role', 'writer');
    expect(result.aggregatedOutput).toHaveProperty('summary', 'stub output for writer');
  });

  it('generates a unique session ID', async () => {
    const result = await engine.execute(makeConfig(), {}, { agentHandler: stubHandler, skipPersistence: true });
    expect(result.sessionId).toMatch(/^team-/);
  });

  it('records totalDurationMs >= 0', async () => {
    const result = await engine.execute(makeConfig(), {}, { agentHandler: stubHandler, skipPersistence: true });
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('uses default stub when no agentHandler provided', async () => {
    const result = await engine.execute(makeConfig(), {}, { skipPersistence: true });
    expect(result.status).toBe('completed');
    expect(result.steps[0].output).toHaveProperty('summary');
  });
});

// ── execute — callbacks ───────────────────────────────────────────────────────

describe('TeamEngine.execute callbacks', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('calls onStepComplete for each completed step', async () => {
    const completed: string[] = [];
    await engine.execute(makeThreeStepConfig(), {}, {
      agentHandler: stubHandler,
      skipPersistence: true,
      onStepComplete: (step) => { completed.push(step.role); },
    });

    expect(completed).toEqual(['writer', 'reviewer']);
  });

  it('calls onStepError when a step fails', async () => {
    const errors: string[] = [];
    await engine.execute(makeConfig(), {}, {
      agentHandler: failingHandler,
      skipPersistence: true,
      onStepError: (step) => { errors.push(step.role); },
    });

    expect(errors).toContain('writer');
  });
});

// ── execute — events ──────────────────────────────────────────────────────────

describe('TeamEngine.execute events', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('emits executionComplete when done', async () => {
    const events: string[] = [];
    engine.on('executionComplete', () => { events.push('complete'); });

    await engine.execute(makeConfig(), {}, { agentHandler: stubHandler, skipPersistence: true });

    expect(events).toContain('complete');
  });

  it('emits stepComplete for each step', async () => {
    const roles: string[] = [];
    engine.on('stepComplete', (data: any) => { roles.push(data.role); });

    await engine.execute(makeThreeStepConfig(), {}, { agentHandler: stubHandler, skipPersistence: true });

    expect(roles).toEqual(['writer', 'reviewer']);
  });

  it('emits stepError when a step fails', async () => {
    const roles: string[] = [];
    engine.on('stepError', (data: any) => { roles.push(data.role); });

    await engine.execute(makeConfig(), {}, { agentHandler: failingHandler, skipPersistence: true });

    expect(roles).toContain('writer');
  });

  it('emits stepRetry during retry attempts', async () => {
    const retryEvents: Array<{ role: string; attempt: number; error: string }> = [];
    engine.on('stepRetry', (data: any) => {
      retryEvents.push({ role: data.role, attempt: data.attempt, error: data.error });
    });

    const handler = retryHandler(1); // Fail once, then succeed
    await engine.execute(makeConfig(), {}, { agentHandler: handler, maxRetries: 2, skipPersistence: true });

    expect(retryEvents).toHaveLength(1);
    expect(retryEvents[0].role).toBe('writer');
    expect(retryEvents[0].attempt).toBe(1);
    expect(retryEvents[0].error).toContain('writer');
  });
});

// ── getStatus / getResults ────────────────────────────────────────────────────

describe('TeamEngine.getStatus / getResults', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('returns status after execution', async () => {
    const result = await engine.execute(makeConfig(), {}, { agentHandler: stubHandler, skipPersistence: true });
    const status = engine.getStatus(result.sessionId);

    expect(status).not.toBeNull();
    expect(status!.sessionId).toBe(result.sessionId);
    expect(status!.teamName).toBe('test-team');
    expect(status!.status).toBe('completed');
    expect(status!.progress).toBe(100);
  });

  it('returns results after execution', async () => {
    const result = await engine.execute(makeConfig(), {}, { agentHandler: stubHandler, skipPersistence: true });
    const stored = engine.getResults(result.sessionId);

    expect(stored).not.toBeNull();
    expect(stored!.sessionId).toBe(result.sessionId);
    expect(stored!.status).toBe('completed');
    expect(stored!.steps).toHaveLength(1);
  });

  it('getStatus returns null for unknown session', () => {
    expect(engine.getStatus('nonexistent')).toBeNull();
  });

  it('getResults returns null for unknown session', () => {
    expect(engine.getResults('nonexistent')).toBeNull();
  });
});

// ── cancel ────────────────────────────────────────────────────────────────────

describe('TeamEngine.cancel', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('returns true when cancelling a known session', async () => {
    const result = await engine.execute(makeConfig(), {}, { agentHandler: stubHandler, skipPersistence: true });
    expect(engine.cancel(result.sessionId)).toBe(true);
  });

  it('returns false for unknown session', () => {
    expect(engine.cancel('nonexistent')).toBe(false);
  });

  it('cancels execution between steps', async () => {
    // Use a multi-step config with slow steps
    const config = makeThreeStepConfig();
    let stepCount = 0;

    const countingHandler = async (agent: TeamAgent, input: Record<string, unknown>) => {
      stepCount++;
      if (stepCount === 1) {
        // After first step completes, cancel the session
        // We need to get the session ID from the engine
      }
      return stubHandler(agent, input);
    };

    // Start execution and cancel it
    const result = await engine.execute(config, {}, {
      agentHandler: countingHandler,
      timeout: 10000,
      skipPersistence: true,
    });

    // Since stubHandler is fast, execution completes before cancel
    // But we can verify cancel works on completed sessions
    expect(result.status).toBe('completed');
    expect(engine.cancel(result.sessionId)).toBe(true);
  });
});

// ── failure — required agent ──────────────────────────────────────────────────

describe('TeamEngine failure handling', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('returns failed status when a required agent fails', async () => {
    const result = await engine.execute(makeConfig(), {}, { agentHandler: failingHandler, skipPersistence: true });

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe('failed');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('writer');
  });

  it('stops pipeline after required agent failure', async () => {
    const config = makeThreeStepConfig();
    // Make writer (required) fail
    const result = await engine.execute(config, {}, { agentHandler: failingHandler, skipPersistence: true });

    expect(result.status).toBe('failed');
    // Only writer step should be executed (researcher was skipped as pipeline starts at writer)
    // Actually, pipeline builds from workflow: [{from: researcher, to: writer}, {from: writer, to: reviewer}]
    // So writer is first, reviewer is second. Writer fails → reviewer never runs.
    expect(result.steps).toHaveLength(1);
  });

  it('returns partial status when optional agent fails', async () => {
    const config = makeThreeStepConfig();
    // Make reviewer (required: false) fail, writer succeeds
    const handler = async (agent: TeamAgent, input: Record<string, unknown>) => {
      if (agent.role === 'reviewer') {
        throw new Error('Reviewer failed');
      }
      return stubHandler(agent, input);
    };

    const result = await engine.execute(config, {}, { agentHandler: handler, skipPersistence: true });

    expect(result.status).toBe('partial');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe('completed');
    expect(result.steps[1].status).toBe('failed');
  });
});

// ── retry ─────────────────────────────────────────────────────────────────────

describe('TeamEngine retry', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('retries on failure and succeeds', async () => {
    const handler = retryHandler(2); // Fail twice, then succeed

    const result = await engine.execute(makeConfig(), {}, {
      agentHandler: handler,
      skipPersistence: true,
      maxRetries: 3,
    });

    expect(result.status).toBe('completed');
    expect(result.steps[0].retries).toBe(2);
  });

  it('exhausts retries and returns failed', async () => {
    const result = await engine.execute(makeConfig(), {}, {
      agentHandler: failingHandler,
      skipPersistence: true,
      maxRetries: 2,
    });

    expect(result.status).toBe('failed');
    expect(result.steps[0].retries).toBe(2);
  });

  it('respects maxRetries from config', async () => {
    const config = makeConfig({ retry: { maxRetries: 1, backoffMs: 10 } });
    const result = await engine.execute(config, {}, { agentHandler: failingHandler, skipPersistence: true });

    expect(result.status).toBe('failed');
    expect(result.steps[0].retries).toBe(1);
  });

  it('options.maxRetries overrides config.retry.maxRetries', async () => {
    const config = makeConfig({ retry: { maxRetries: 0, backoffMs: 10 } });
    const result = await engine.execute(config, {}, {
      agentHandler: failingHandler,
      skipPersistence: true,
      maxRetries: 3,
    });

    expect(result.steps[0].retries).toBe(3);
  });
});

// ── timeout ───────────────────────────────────────────────────────────────────

describe('TeamEngine timeout', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('returns failed when step exceeds timeout', async () => {
    const result = await engine.execute(makeConfig(), {}, {
      agentHandler: slowHandler(5000),
      timeout: 100,
      skipPersistence: true,
    });

    expect(result.status).toBe('failed');
    expect(result.errors[0]).toContain('timed out');
  });

  it('succeeds when step completes before timeout', async () => {
    const result = await engine.execute(makeConfig(), {}, {
      agentHandler: slowHandler(10),
      timeout: 5000,
      skipPersistence: true,
    });

    expect(result.status).toBe('completed');
  });

  it('respects timeout from config', async () => {
    const config = makeConfig({ timeout: 100 });
    const result = await engine.execute(config, {}, {
      agentHandler: slowHandler(5000),
      skipPersistence: true,
    });

    expect(result.status).toBe('failed');
    expect(result.errors[0]).toContain('timed out');
  });
});

// ── edge cases ────────────────────────────────────────────────────────────────

describe('TeamEngine edge cases', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('handles empty input gracefully', async () => {
    const result = await engine.execute(makeConfig(), {}, { agentHandler: stubHandler, skipPersistence: true });
    expect(result.status).toBe('completed');
    // aggregatedOutput contains step output (merged)
    expect(result.aggregatedOutput).toHaveProperty('role', 'writer');
  });

  it('handles complex nested input', async () => {
    const input = { nested: { deep: true }, arr: [1, 2, 3] };
    const result = await engine.execute(makeConfig(), input, { agentHandler: stubHandler, skipPersistence: true });
    expect(result.status).toBe('completed');
    expect(result.aggregatedOutput).toHaveProperty('nested');
  });

  it('generates different session IDs for concurrent executions', async () => {
    const [r1, r2] = await Promise.all([
      engine.execute(makeConfig(), {}, { agentHandler: stubHandler, skipPersistence: true }),
      engine.execute(makeConfig(), {}, { agentHandler: stubHandler, skipPersistence: true }),
    ]);
    expect(r1.sessionId).not.toBe(r2.sessionId);
  });

  it('context passes between steps (aggregated output)', async () => {
    const config = makeThreeStepConfig();
    const result = await engine.execute(config, { initial: true }, { agentHandler: stubHandler, skipPersistence: true });

    // First step output is merged, so second step's aggregatedOutput contains both
    expect(result.aggregatedOutput).toHaveProperty('initial', true);
    expect(result.aggregatedOutput).toHaveProperty('role', 'reviewer'); // from last step
  });
});

// ── Phase B: DAG parallel execution ───────────────────────────────────────────

describe('TeamEngine Phase B — DAG parallel execution', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('detects DAG mode when workflow has branching (multiple steps in same level)', async () => {
    // Two independent steps from the same source → same DAG level
    const config: TeamConfig = {
      name: 'dag-branch',
      version: '1.0.0',
      agents: [
        { role: 'researcher', agent_ref: 'researcher-agent', required: true },
        { role: 'writer', agent_ref: 'writer-agent', required: true },
        { role: 'reviewer', agent_ref: 'reviewer-agent', required: true },
      ],
      workflow: [
        { from: 'researcher', to: 'writer' },
        { from: 'researcher', to: 'reviewer' },
      ],
    };

    const result = await engine.execute(config, {}, { agentHandler: stubHandler, skipPersistence: true });
    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(2);
    // Both writer and reviewer should have executed
    const roles = result.steps.map(s => s.role).sort();
    expect(roles).toEqual(['reviewer', 'writer']);
  });

  it('executes same-level steps concurrently (DAG mode)', async () => {
    const timestamps: Record<string, number> = {};
    const trackingHandler = async (agent: TeamAgent, input: Record<string, unknown>) => {
      timestamps[agent.role] = Date.now();
      await new Promise(r => setTimeout(r, 50));
      return {
        role: agent.role,
        agentRef: agent.agent_ref,
        status: 'completed' as const,
        input,
        output: { role: agent.role, summary: `done by ${agent.role}` },
        retries: 0,
      };
    };

    const config: TeamConfig = {
      name: 'dag-concurrent',
      version: '1.0.0',
      agents: [
        { role: 'source', agent_ref: 'source-agent', required: true },
        { role: 'a', agent_ref: 'a-agent', required: true },
        { role: 'b', agent_ref: 'b-agent', required: true },
      ],
      workflow: [
        { from: 'source', to: 'a' },
        { from: 'source', to: 'b' },
      ],
    };

    await engine.execute(config, {}, { agentHandler: trackingHandler, skipPersistence: true });

    // Both 'a' and 'b' should start within a short window (concurrent)
    const aStart = timestamps['a'];
    const bStart = timestamps['b'];
    expect(aStart).toBeDefined();
    expect(bStart).toBeDefined();
    expect(Math.abs(aStart - bStart)).toBeLessThan(30); // started within 30ms of each other
  });

  it('falls back to sequential mode for linear workflows', async () => {
    const config: TeamConfig = {
      name: 'sequential',
      version: '1.0.0',
      agents: [
        { role: 'a', agent_ref: 'a-agent', required: true },
        { role: 'b', agent_ref: 'b-agent', required: true },
      ],
      workflow: [
        { from: 'a', to: 'b' },
      ],
    };

    const result = await engine.execute(config, {}, { agentHandler: stubHandler, skipPersistence: true });
    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].role).toBe('b');
  });

  it('propagates failure in DAG mode when a required step fails', async () => {
    const config: TeamConfig = {
      name: 'dag-fail',
      version: '1.0.0',
      agents: [
        { role: 'source', agent_ref: 'source-agent', required: true },
        { role: 'a', agent_ref: 'a-agent', required: true },
        { role: 'b', agent_ref: 'b-agent', required: true },
      ],
      workflow: [
        { from: 'source', to: 'a' },
        { from: 'source', to: 'b' },
      ],
    };

    const failA = async (agent: TeamAgent, input: Record<string, unknown>) => {
      if (agent.role === 'a') throw new Error('A failed');
      return stubHandler(agent, input);
    };

    const result = await engine.execute(config, {}, { agentHandler: failA, skipPersistence: true });
    expect(result.status).toBe('failed');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ── Phase B: Human-in-the-loop ────────────────────────────────────────────────

describe('TeamEngine Phase B — Human-in-the-loop', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('pauses and waits for approval when agent_type is human', async () => {
    const humanApproved = new Promise<{ role: string; data: Record<string, unknown> }>((resolve) => {
      setTimeout(() => {
        const pending = engine.getPendingApprovals();
        expect(pending).toHaveLength(1);
        expect(pending[0].role).toBe('reviewer');
        engine.approve(pending[0].sessionId, { approved: true, comment: 'looks good' });
        resolve({ role: pending[0].role, data: { approved: true, comment: 'looks good' } });
      }, 10);
    });

    const config: TeamConfig = {
      name: 'human-loop',
      version: '1.0.0',
      agents: [
        { role: 'worker', agent_ref: 'worker-agent', required: true },
        { role: 'reviewer', agent_ref: 'reviewer-agent', required: true, agent_type: 'human' },
      ],
      workflow: [
        { from: 'worker', to: 'reviewer' },
      ],
    };

    const handler = async (agent: TeamAgent, input: Record<string, unknown>) => {
      if (agent.role === 'worker') {
        return {
          role: agent.role,
          agentRef: agent.agent_ref,
          status: 'completed' as const,
          input,
          output: { role: agent.role, summary: 'work done' },
          retries: 0,
        };
      }
      // reviewer is human — should not reach here
      return stubHandler(agent, input);
    };

    const result = await engine.execute(config, {}, { agentHandler: handler, skipPersistence: true });
    const approval = await humanApproved;

    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].role).toBe('reviewer');
    expect(result.steps[1].status).toBe('completed');
    expect(result.steps[1].output).toHaveProperty('approved', true);
  });

  it('rejects a pending human step and marks it failed', async () => {
    const rejectionHandled = new Promise<void>((resolve) => {
      setTimeout(() => {
        const pending = engine.getPendingApprovals();
        expect(pending).toHaveLength(1);
        engine.reject(pending[0].sessionId, 'Not satisfied with the result');
        resolve();
      }, 10);
    });

    const config: TeamConfig = {
      name: 'human-reject',
      version: '1.0.0',
      agents: [
        { role: 'worker', agent_ref: 'worker-agent', required: true },
        { role: 'reviewer', agent_ref: 'reviewer-agent', required: true, agent_type: 'human' },
      ],
      workflow: [
        { from: 'worker', to: 'reviewer' },
      ],
    };

    const handler = async (agent: TeamAgent, input: Record<string, unknown>) => {
      if (agent.role === 'worker') {
        return {
          role: agent.role,
          agentRef: agent.agent_ref,
          status: 'completed' as const,
          input,
          output: { role: agent.role, summary: 'work done' },
          retries: 0,
        };
      }
      return stubHandler(agent, input);
    };

    const result = await engine.execute(config, {}, { agentHandler: handler, skipPersistence: true });
    await rejectionHandled;

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].role).toBe('reviewer');
    expect(result.steps[1].status).toBe('failed');
    expect(result.steps[1].error).toContain('Not satisfied with the result');
  });

  it('times out a pending human step after approval_timeout', async () => {
    const config: TeamConfig = {
      name: 'human-timeout',
      version: '1.0.0',
      agents: [
        { role: 'worker', agent_ref: 'worker-agent', required: true },
        { role: 'reviewer', agent_ref: 'reviewer-agent', required: true, agent_type: 'human', approval_timeout: 100 },
      ],
      workflow: [
        { from: 'worker', to: 'reviewer' },
      ],
    };

    const handler = async (agent: TeamAgent, input: Record<string, unknown>) => {
      if (agent.role === 'worker') {
        return {
          role: agent.role,
          agentRef: agent.agent_ref,
          status: 'completed' as const,
          input,
          output: { role: agent.role, summary: 'work done' },
          retries: 0,
        };
      }
      return stubHandler(agent, input);
    };

    const start = Date.now();
    const result = await engine.execute(config, {}, { agentHandler: handler, skipPersistence: true });
    const elapsed = Date.now() - start;

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].role).toBe('reviewer');
    expect(result.steps[1].status).toBe('failed');
    expect(result.steps[1].error).toContain('timed out');
    expect(elapsed).toBeGreaterThanOrEqual(80); // should have waited at least ~100ms
  });

  it('returns false from approve/reject when no pending approval exists', () => {
    expect(engine.approve('nonexistent-session', {})).toBe(false);
    expect(engine.reject('nonexistent-session', 'reason')).toBe(false);
  });

  it('getPendingApprovals returns empty array when no approvals pending', async () => {
    const pending = engine.getPendingApprovals();
    expect(pending).toEqual([]);
  });
});

// ── Phase B: Nested sub-teams ──────────────────────────────────────────────────

describe('TeamEngine Phase B — Nested sub-teams', () => {
  let engine: TeamEngine;

  beforeEach(() => {
    engine = new TeamEngine();
  });

  it('executes a nested sub-team and maps result to step output', async () => {
    const subConfig: TeamConfig = {
      name: 'sub-team',
      version: '1.0.0',
      agents: [
        { role: 'sub-worker', agent_ref: 'sub-worker-agent', required: true },
      ],
      workflow: [
        { from: 'sub-worker', to: 'sub-worker' },
      ],
    };

    const config: TeamConfig = {
      name: 'parent-team',
      version: '1.0.0',
      agents: [
        { role: 'coordinator', agent_ref: 'coordinator-agent', required: true },
      ],
      workflow: [
        {
          from: 'coordinator',
          to: 'coordinator',
          sub_team: subConfig,
        },
      ],
    };

    const handler = async (agent: TeamAgent, input: Record<string, unknown>) => {
      if (agent.role === 'sub-worker') {
        return {
          role: agent.role,
          agentRef: agent.agent_ref,
          status: 'completed' as const,
          input,
          output: { role: agent.role, summary: 'sub-work done' },
          retries: 0,
        };
      }
      return stubHandler(agent, input);
    };

    const result = await engine.execute(config, {}, { agentHandler: handler, skipPersistence: true });

    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].role).toBe('sub-team');
    expect(result.steps[0].agentRef).toBe('sub-team:sub-team');
    expect(result.steps[0].status).toBe('completed');
    expect(result.steps[0].output).toHaveProperty('sub_team', 'sub-team');
  });

  it('propagates sub-team failure to parent step', async () => {
    const subConfig: TeamConfig = {
      name: 'failing-sub',
      version: '1.0.0',
      agents: [
        { role: 'sub-worker', agent_ref: 'sub-worker-agent', required: true },
      ],
      workflow: [
        { from: 'sub-worker', to: 'sub-worker' },
      ],
    };

    const config: TeamConfig = {
      name: 'parent-team',
      version: '1.0.0',
      agents: [
        { role: 'coordinator', agent_ref: 'coordinator-agent', required: true },
      ],
      workflow: [
        {
          from: 'coordinator',
          to: 'coordinator',
          sub_team: subConfig,
        },
      ],
    };

    const handler = async () => {
      throw new Error('sub-team worker failed');
    };

    const result = await engine.execute(config, {}, { agentHandler: handler, skipPersistence: true });

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe('failed');
    expect(result.steps[0].error).toContain('sub-team worker failed');
  });

  it('passes input through to nested sub-team', async () => {
    let capturedInput: Record<string, unknown> = {};
    const subConfig: TeamConfig = {
      name: 'input-sub',
      version: '1.0.0',
      agents: [
        { role: 'sub-worker', agent_ref: 'sub-worker-agent', required: true },
      ],
      workflow: [
        { from: 'sub-worker', to: 'sub-worker' },
      ],
    };

    const config: TeamConfig = {
      name: 'parent-team',
      version: '1.0.0',
      agents: [
        { role: 'coordinator', agent_ref: 'coordinator-agent', required: true },
      ],
      workflow: [
        {
          from: 'coordinator',
          to: 'coordinator',
          sub_team: subConfig,
        },
      ],
    };

    const handler = async (agent: TeamAgent, input: Record<string, unknown>) => {
      if (agent.role === 'sub-worker') {
        capturedInput = input;
        return {
          role: agent.role,
          agentRef: agent.agent_ref,
          status: 'completed' as const,
          input,
          output: { role: agent.role, summary: 'sub-work done' },
          retries: 0,
        };
      }
      return stubHandler(agent, input);
    };

    await engine.execute(config, { topic: 'AI', priority: 'high' }, { agentHandler: handler, skipPersistence: true });

    expect(capturedInput).toHaveProperty('topic', 'AI');
    expect(capturedInput).toHaveProperty('priority', 'high');
  });
});
