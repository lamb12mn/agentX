/**
 * Team Engine — Multi-agent orchestration execution engine.
 *
 * Executes a team workflow by running agents in sequence or DAG,
 * passing context between steps, handling retry/timeout, and
 * aggregating results.
 *
 * Phase 1: Stub execution (placeholder output per step)
 * Phase 2: AI delegation via AiProvider + condition + template + variables + persistence
 * Phase 3 (current): DAG execution, parallel steps, human approval, nested sub-teams
 */

import { EventEmitter } from 'events';
import type { TeamConfig, TeamAgent, TeamWorkflowStep } from '../types.js';
import { AIAssistant } from '../ai/assistant.js';
import type { AiProvider } from '../ai/provider.js';
import { renderTemplate, getPathValue } from './template.js';
import { log } from '../observability/logger.js';
import {
  ensureExecutionTables,
  insertSession,
  updateSessionStatus,
  insertStep,
  getExecutionStatus as getPersistedStatus,
  getExecutionResult as getPersistedResult,
  listExecutionHistory,
  getStepLogs,
} from '../store/executions.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EngineOptions {
  /** AI provider for real agent delegation (optional — falls back to AIAssistant or stub) */
  aiProvider?: AiProvider;
  /** AI assistant for suggestion-based execution (fallback) */
  aiAssistant?: AIAssistant;
  /** Maximum concurrent team executions (default 5) */
  maxConcurrent?: number;
}

export interface ExecutionOptions {
  timeout?: number;
  maxRetries?: number;
  onStepComplete?: (step: StepResult) => void;
  onStepError?: (step: StepResult) => void;
  /** Override agent execution for testing. Return StepResult or throw to simulate failure. */
  agentHandler?: (agent: TeamAgent, input: Record<string, unknown>, timeout: number) => Promise<Omit<StepResult, 'durationMs'>>;
  /** Skip DB persistence (for testing) */
  skipPersistence?: boolean;
}

export interface TeamExecutionResult {
  sessionId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'partial';
  steps: StepResult[];
  aggregatedOutput: Record<string, unknown>;
  totalDurationMs: number;
  errors: string[];
}

export interface StepResult {
  role: string;
  agentRef: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs: number;
  error?: string;
  retries: number;
}

export interface TeamExecutionStatus {
  sessionId: string;
  teamName: string;
  status: TeamExecutionResult['status'];
  currentStep: string | null;
  progress: number; // 0-100
  startedAt: number;
  estimatedCompletion: number | null;
}

interface ExecutionState {
  config: TeamConfig;
  input: Record<string, unknown>;
  options: ExecutionOptions;
  result: TeamExecutionResult;
  status: TeamExecutionStatus;
  cancelled: boolean;
}

/** Pending human approval */
export interface PendingApproval {
  sessionId: string;
  role: string;
  agentRef: string;
  input: Record<string, unknown>;
  startedAt: number;
  timeout: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateSessionId(): string {
  return `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely evaluate a condition expression against step output and input.
 * Supports patterns like:
 *   output.confidence >= 0.8
 *   output.status === "done"
 *   input.topic !== ""
 *
 * Uses Function() constructor in a sandbox with only output/input in scope.
 */
function evaluateCondition(
  condition: string,
  output: Record<string, unknown>,
  input: Record<string, unknown>,
): boolean {
  // If condition is empty, step always executes
  if (!condition || condition.trim() === '') return true;

  try {
    // Wrap condition in return statement for evaluation
    const fn = new Function('output', 'input', `return (${condition});`);
    const result = fn(output, input);
    return result === true;
  } catch {
    // On parse error, execute the step (fail-open)
    log.warn('team.condition.parse_error', { condition });
    return true;
  }
}

/**
 * Apply variable mapping from TeamConfig.variables to produce step input.
 */
function applyVariableMapping(
  variables: TeamConfig['variables'],
  globalInput: Record<string, unknown>,
  aggregatedOutput: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!variables || variables.length === 0) return null;

  const mapped: Record<string, unknown> = {};
  for (const v of variables) {
    let value: unknown;

    if (v.source === 'input') {
      value = v.field ? getPathValue({ input: globalInput }, `input.${v.field}`) : globalInput;
    } else if (v.source === 'step_output') {
      value = v.step_role
        ? getPathValue(aggregatedOutput, v.step_role)
        : aggregatedOutput;
      if (v.field && typeof value === 'object' && value !== null) {
        value = (value as Record<string, unknown>)[v.field];
      }
    }

    if (value !== undefined) {
      mapped[v.name] = value;
    }
  }

  return mapped;
}

/** Fire an HTTP webhook (fire-and-forget). */
function fireWebhook(
  webhook: { url: string; headers?: Record<string, string> },
  event: string,
  payload: Record<string, unknown>,
): void {
  fetch(webhook.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...webhook.headers,
    },
    body: JSON.stringify({ event, ...payload }),
  }).catch(err => {
    log.warn('team.webhook.failed', { url: webhook.url, event, error: (err as Error).message });
  });
}

function shouldFireWebhook(
  webhook: { events: string[] },
  event: string,
): boolean {
  return webhook.events.includes('all') || webhook.events.includes(event);
}

// ── DAG utilities (Phase B foundation) ───────────────────────────────────────

interface DagNode {
  step: TeamWorkflowStep;
  agent: TeamAgent;
  inDegree: number;
  dependents: number[];
}

/**
 * Build a DAG from workflow steps and return execution levels (topological order).
 * Steps in the same level can be executed in parallel.
 *
 * Level 0: Steps whose "to" role has no predecessors
 * Level 1: Steps whose "from" role matches a preceding "to" role
 * ...
 *
 * Currently unused in sequential mode — reserved for Phase B parallel execution.
 */
function buildDagLevels(
  agents: TeamAgent[],
  workflow: TeamWorkflowStep[],
): TeamWorkflowStep[][] {
  const agentMap = new Map(agents.map(a => [a.role, a]));
  const nodes: DagNode[] = workflow.map((step) => ({
    step,
    agent: agentMap.get(step.to)!,
    inDegree: 0,
    dependents: [],
  }));

  // Build edge: step A's "to" feeds into step B's "from"
  for (let i = 0; i < workflow.length; i++) {
    for (let j = 0; j < workflow.length; j++) {
      if (i === j) continue;
      // If step i's "to" matches step j's "from", j depends on i
      if (workflow[i].to === workflow[j].from) {
        nodes[j].inDegree++;
        nodes[i].dependents.push(j);
      }
    }
  }

  // Kahn's algorithm for topological sort with levels
  const levels: TeamWorkflowStep[][] = [];
  const queue: number[] = [];
  const visited = new Set<number>();

  nodes.forEach((n, i) => { if (n.inDegree === 0) queue.push(i); });

  while (queue.length > 0) {
    const level: TeamWorkflowStep[] = [];
    const size = queue.length;

    for (let i = 0; i < size; i++) {
      const idx = queue.shift()!;
      if (visited.has(idx)) continue;
      visited.add(idx);
      level.push(nodes[idx].step);

      for (const dep of nodes[idx].dependents) {
        nodes[dep].inDegree--;
        if (nodes[dep].inDegree === 0) {
          queue.push(dep);
        }
      }
    }

    if (level.length > 0) levels.push(level);
  }

  return levels;
}

// ── TeamEngine ───────────────────────────────────────────────────────────────

export class TeamEngine extends EventEmitter {
  private sessions = new Map<string, ExecutionState>();
  private aiAssistant?: AIAssistant;
  private aiProvider?: AiProvider;
  private maxConcurrent: number;
  private pendingApprovals = new Map<string, PendingApproval>();
  private pendingApprovalResolvers = new Map<string, {
    resolve: (data: Record<string, unknown>) => void;
    reject: (reason: string) => void;
  }>();
  private activeCount = 0;

  constructor(options?: EngineOptions) {
    super();
    this.aiProvider = options?.aiProvider;
    this.aiAssistant = options?.aiAssistant;
    this.maxConcurrent = options?.maxConcurrent ?? 5;
  }

  /**
   * Execute a team workflow:
   * 1. Validate config
   * 2. Resolve steps in pipeline order (or DAG order)
   * 3. For each step: prepare input → invoke agent → pass output to next
   * 4. Handle retry/timeout per step
   * 5. Persist results
   * 6. Aggregate results
   */
  async execute(
    teamConfig: TeamConfig,
    input: Record<string, unknown>,
    options?: ExecutionOptions,
  ): Promise<TeamExecutionResult> {
    // Check concurrency limit
    if (this.activeCount >= this.maxConcurrent) {
      throw new Error(`Max concurrent executions reached (${this.maxConcurrent}). Try again later.`);
    }

    const sessionId = generateSessionId();
    const startTime = Date.now();
    const maxRetries = options?.maxRetries ?? teamConfig.retry?.maxRetries ?? 0;
    const stepTimeout = options?.timeout ?? teamConfig.timeout ?? 30_000;

    // Validate config
    TeamEngine.validateConfig(teamConfig);

    // Ensure DB tables (idempotent)
    if (!options?.skipPersistence) {
      ensureExecutionTables();
    }

    // Build DAG levels + sequential pipeline fallback
    const dagLevels = buildDagLevels(teamConfig.agents, teamConfig.workflow);
    const agentMap = new Map(teamConfig.agents.map(a => [a.role, a]));
    const isDagMode = dagLevels.some(l => l.length > 1);
    const pipeline = !isDagMode ? this.buildPipeline(teamConfig, input) : [];

    const result: TeamExecutionResult = {
      sessionId,
      status: 'completed',
      steps: [],
      aggregatedOutput: { ...input },
      totalDurationMs: 0,
      errors: [],
    };

    const status: TeamExecutionStatus = {
      sessionId,
      teamName: teamConfig.name,
      status: 'completed',
      currentStep: null,
      progress: 0,
      startedAt: startTime,
      estimatedCompletion: null,
    };

    const state: ExecutionState = {
      config: teamConfig,
      input,
      options: options ?? {},
      result,
      status,
      cancelled: false,
    };

    this.sessions.set(sessionId, state);
    this.activeCount++;

    // Persist session (fire-and-forget)
    if (!options?.skipPersistence) {
      try {
        insertSession(sessionId, teamConfig.name, JSON.stringify(teamConfig), input, startTime);
      } catch (err) {
        log.warn('team.persist.insert_session_failed', { sessionId, error: (err as Error).message });
      }
    }

    // Webhook: start
    if (teamConfig.webhook && shouldFireWebhook(teamConfig.webhook, 'start')) {
      fireWebhook(teamConfig.webhook, 'start', { sessionId, teamName: teamConfig.name, input });
    }

    log.info('team.execution.start', {
      sessionId, teamName: teamConfig.name,
      mode: isDagMode ? 'dag' : 'sequential',
      steps: isDagMode ? teamConfig.workflow.length : pipeline.length,
    });

    // ── Helper: execute one step and process its result ──────────────────
    const execStep = async (
      wfStep: TeamWorkflowStep,
      wfAgent: TeamAgent,
      stepIdx: number,
    ): Promise<boolean> => {
      if (state.cancelled) { result.status = 'cancelled'; return false; }

      status.currentStep = wfAgent.role;
      this.emit('stepStart', { sessionId, role: wfAgent.role, step: stepIdx + 1 });

      const stepInput = this.prepareStepInput(wfStep, teamConfig.variables, result.aggregatedOutput, input);
      const stepResult = await this.executeStepWithRetry(
        wfAgent, stepInput, maxRetries, stepTimeout, options?.agentHandler, sessionId, wfStep,
      );

      // Persist step
      if (!options?.skipPersistence) {
        try { insertStep(sessionId, stepResult, stepIdx, startTime); }
        catch (err) { log.warn('team.persist.insert_step_failed', { sessionId, role: wfAgent.role, error: (err as Error).message }); }
      }

      result.steps.push(stepResult);

      if (stepResult.status === 'completed') {
        Object.assign(result.aggregatedOutput, stepResult.output);
        this.emit('stepComplete', { sessionId, role: wfAgent.role, result: stepResult });
        options?.onStepComplete?.(stepResult);
        if (teamConfig.webhook && shouldFireWebhook(teamConfig.webhook, 'step.complete')) {
          fireWebhook(teamConfig.webhook, 'step.complete', {
            sessionId, role: wfAgent.role, stepIdx, output: stepResult.output,
          });
        }
        log.info('team.step.complete', { sessionId, role: wfAgent.role, durationMs: stepResult.durationMs });
      } else if (stepResult.status === 'failed') {
        result.errors.push(`Step "${wfAgent.role}" failed: ${stepResult.error}`);
        this.emit('stepError', { sessionId, role: wfAgent.role, result: stepResult });
        options?.onStepError?.(stepResult);
        if (teamConfig.webhook && shouldFireWebhook(teamConfig.webhook, 'step.failed')) {
          fireWebhook(teamConfig.webhook, 'step.failed', {
            sessionId, role: wfAgent.role, stepIdx, error: stepResult.error,
          });
        }
        log.warn('team.step.failed', { sessionId, role: wfAgent.role, error: stepResult.error });
        if (wfAgent.required !== false) {
          result.status = 'failed';
          return false;
        }
        result.status = 'partial';
      } else if (stepResult.status === 'skipped') {
        log.info('team.step.skipped', { sessionId, role: wfAgent.role, condition: wfStep.condition });
      }

      return true;
    };

    let stepIndex = 0;

    try {
      if (isDagMode) {
        // ── DAG execution — each level's steps run concurrently ─────────
        for (let levelIdx = 0; levelIdx < dagLevels.length; levelIdx++) {
          if (state.cancelled) { result.status = 'cancelled'; break; }

          const level = dagLevels[levelIdx]
            .map(wf => ({ step: wf, agent: agentMap.get(wf.to)! }))
            .filter(({ step }) => {
              if (step.condition) {
                const shouldRun = evaluateCondition(step.condition, result.aggregatedOutput, input);
                if (!shouldRun) {
                  log.info('team.condition.skipped', { role: step.to, condition: step.condition });
                  result.aggregatedOutput[step.to] = { role: step.to, skipped: true, condition: step.condition };
                  return false;
                }
              }
              return true;
            });

          if (level.length === 0) continue;

          status.currentStep = level.map(s => s.agent.role).join('|');
          status.progress = Math.round((levelIdx / dagLevels.length) * 100);
          this.emit('levelStart', { sessionId, level: levelIdx, steps: level.length });
          log.info('team.dag.level_start', { sessionId, level: levelIdx, steps: level.length });

          const stepResults = await Promise.all(level.map(({ step, agent }, i) =>
            execStep(step, agent, stepIndex + i),
          ));
          stepIndex += level.length;

          if (stepResults.some(r => !r)) break;
        }
      } else {
        // ── Sequential execution ─────────────────────────────────────────
        for (const { step, agent } of pipeline) {
          status.progress = Math.round((stepIndex / pipeline.length) * 100);
          const shouldContinue = await execStep(step, agent, stepIndex++);
          if (!shouldContinue) break;
        }
      }

      if (result.status === 'completed' && !state.cancelled) {
        status.progress = 100;
      }
    } catch (err) {
      result.status = 'failed';
      result.errors.push(err instanceof Error ? err.message : String(err));
      log.error('team.execution.error', { sessionId, error: (err as Error).message });
    } finally {
      result.totalDurationMs = Date.now() - startTime;
      status.status = result.status;
      status.currentStep = null;
      this.activeCount--;

      this.emit('executionComplete', { sessionId, result });

      // Persist final status (fire-and-forget)
      if (!options?.skipPersistence) {
        try {
          updateSessionStatus(sessionId, result.status, result.aggregatedOutput, result.totalDurationMs, result.errors);
        } catch (err) {
          log.warn('team.persist.update_session_failed', { sessionId, error: (err as Error).message });
        }
      }

      // Webhook: complete
      if (teamConfig.webhook && shouldFireWebhook(teamConfig.webhook, 'complete')) {
        fireWebhook(teamConfig.webhook, 'complete', {
          sessionId, teamName: teamConfig.name, status: result.status,
          totalDurationMs: result.totalDurationMs, errors: result.errors,
        });
      }

      log.info('team.execution.complete', { sessionId, status: result.status, totalDurationMs: result.totalDurationMs });
    }

    return result;
  }

  /**
   * Get execution status by session ID (from memory, fallback to DB).
   */
  getStatus(sessionId: string): TeamExecutionStatus | null {
    return this.sessions.get(sessionId)?.status ?? (() => {
      try { return getPersistedStatus(sessionId); } catch { return null; }
    })();
  }

  /**
   * Get full execution results by session ID (from memory, fallback to DB).
   */
  getResults(sessionId: string): TeamExecutionResult | null {
    return this.sessions.get(sessionId)?.result ?? (() => {
      try { return getPersistedResult(sessionId); } catch { return null; }
    })();
  }

  /**
   * List execution history (from DB).
   */
  getHistory(limit = 20, offset = 0) {
    return listExecutionHistory(limit, offset);
  }

  /**
   * Get step logs for a session (from DB).
   */
  getStepLogs(sessionId: string) {
    return getStepLogs(sessionId);
  }

  /**
   * Cancel a running execution.
   */
  cancel(sessionId: string): boolean {
    const state = this.sessions.get(sessionId);
    if (!state) return false;
    state.cancelled = true;
    return true;
  }

  /**
   * Approve a pending human-in-the-loop step.
   */
  approve(sessionId: string, data: Record<string, unknown>): boolean {
    const resolver = this.pendingApprovalResolvers.get(sessionId);
    if (!resolver) return false;
    resolver.resolve(data);
    this.emit('stepApproved', { sessionId, data });
    return true;
  }

  /**
   * Reject a pending human-in-the-loop step.
   */
  reject(sessionId: string, reason: string): boolean {
    const resolver = this.pendingApprovalResolvers.get(sessionId);
    if (!resolver) return false;
    resolver.reject(reason);
    this.emit('stepRejected', { sessionId, reason });
    return true;
  }

  /**
   * List all pending approvals.
   */
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values());
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * Validate a team config structure. Throws on invalid config.
   */
  static validateConfig(config: TeamConfig): void {
    if (!config.name) throw new Error('Team config must have a name');
    if (!config.agents || config.agents.length === 0) {
      throw new Error('Team config must have at least one agent');
    }
    if (!config.workflow || config.workflow.length === 0) {
      throw new Error('Team config must have at least one workflow step');
    }

    const roles = new Set(config.agents.map(a => a.role));
    for (const step of config.workflow) {
      if (!roles.has(step.from)) {
        throw new Error(`Workflow references unknown role: "${step.from}"`);
      }
      if (!roles.has(step.to)) {
        throw new Error(`Workflow references unknown role: "${step.to}"`);
      }
    }
  }

  /**
   * Build an ordered execution pipeline from the workflow steps.
   * Checks conditions — skips steps whose condition evaluates to false.
   */
  private buildPipeline(
    config: TeamConfig,
    input: Record<string, unknown>,
  ): Array<{ step: TeamWorkflowStep; agent: TeamAgent }> {
    const agentMap = new Map(config.agents.map(a => [a.role, a]));
    const aggregatedOutput: Record<string, unknown> = { ...input };

    return config.workflow.filter(wf => {
      // Evaluate condition against current aggregated output
      if (wf.condition) {
        const shouldRun = evaluateCondition(wf.condition, aggregatedOutput, input);
        if (!shouldRun) {
          log.info('team.condition.skipped', { role: wf.to, condition: wf.condition });
          // Still merge a placeholder so downstream steps don't break
          aggregatedOutput[wf.to] = {
            role: wf.to,
            skipped: true,
            condition: wf.condition,
          };
        }
        return shouldRun;
      }

      return true;
    }).map(wf => ({
      step: wf,
      agent: agentMap.get(wf.to)!,
    }));
  }

  /**
   * Prepare input for a step:
   * 1. Apply variable mapping if defined
   * 2. Render input_template if defined
   * 3. Fall back to merged global + previous output
   */
  private prepareStepInput(
    step: TeamWorkflowStep,
    variables: TeamConfig['variables'],
    aggregatedOutput: Record<string, unknown>,
    globalInput: Record<string, unknown>,
  ): Record<string, unknown> {
    // Step 1: Apply explicit variable mapping
    const mapped = applyVariableMapping(variables, globalInput, aggregatedOutput);

    if (mapped) {
      // If variables are explicitly mapped, use them as the primary input
      const stepInput = { ...mapped };

      // Step 2: Render input_template over the mapped variables
      if (step.input_template) {
        stepInput._rendered_prompt = renderTemplate(step.input_template, {
          input: globalInput,
          output: aggregatedOutput,
          variables: mapped,
        });
      }

      return stepInput;
    }

    // Step 3: No variables — use aggregated output, with optional template rendering
    const stepInput: Record<string, unknown> = {
      ...globalInput,
      ...aggregatedOutput,
    };

    if (step.input_template) {
      stepInput._prompt = renderTemplate(step.input_template, {
        input: globalInput,
        output: aggregatedOutput,
      });
    }

    return stepInput;
  }

  /**
   * Execute a single step with retry logic.
   */
  private async executeStepWithRetry(
    agent: TeamAgent,
    input: Record<string, unknown>,
    maxRetries: number,
    timeout: number,
    agentHandler?: (agent: TeamAgent, input: Record<string, unknown>, timeout: number) => Promise<Omit<StepResult, 'durationMs'>>,
    sessionId?: string,
    step?: TeamWorkflowStep,
  ): Promise<StepResult> {
    const startTime = Date.now();
    let lastError: string | undefined;
    let retries = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        retries++;
        const backoff = Math.min(100 * Math.pow(2, attempt - 1), 5000);
        await sleep(backoff);
      }

      try {
        const result = await this.executeSingleStep(agent, input, timeout, agentHandler, sessionId, step);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < maxRetries) {
          this.emit('stepRetry', {
            role: agent.role,
            attempt: attempt + 1,
            maxRetries,
            error: lastError,
          });
        }
      }
    }

    return {
      role: agent.role,
      agentRef: agent.agent_ref,
      status: 'failed',
      input,
      output: {},
      durationMs: Date.now() - startTime,
      error: lastError ?? 'Unknown error',
      retries,
    };
  }

  /**
   * Execute a single step using the best available execution strategy:
   *   0. Human-in-the-loop (agent_type === 'human')
   *   1. agentHandler (test override)
   *   2. Nested sub-team (step.sub_team)
   *   3. real aiProvider (OpenAI / Anthropic / etc.)
   *   4. AIAssistant (suggestion-based simulation)
   *   5. stub (fallback placeholder)
   */
  private async executeSingleStep(
    agent: TeamAgent,
    input: Record<string, unknown>,
    timeout: number,
    agentHandler?: (agent: TeamAgent, input: Record<string, unknown>, timeout: number) => Promise<Omit<StepResult, 'durationMs'>>,
    sessionId?: string,
    step?: TeamWorkflowStep,
  ): Promise<StepResult> {
    const startTime = Date.now();

    // Priority 0: Human-in-the-loop — pause and wait for external approval
    if (agent.agent_type === 'human' && sessionId) {
      return await this.executeHumanStep(agent, input, timeout, startTime, sessionId);
    }

    // Priority 1: Test handler override
    if (agentHandler) {
      const result = await this.executeWithTimeout(
        () => agentHandler(agent, input, timeout),
        timeout,
        agent,
      );
      return { ...result, durationMs: Date.now() - startTime };
    }

    // Priority 2: Nested sub-team
    if (step?.sub_team) {
      return await this.executeSubTeam(step.sub_team, input, timeout, startTime);
    }

    // Priority 3: Real AI provider
    if (this.aiProvider) {
      return await this.executeWithAiProvider(agent, input, timeout, startTime);
    }

    // Priority 4: AIAssistant fallback
    if (this.aiAssistant) {
      const result = await this.executeWithTimeout(
        () => this.aiAssistant!.executeAgent(agent, input, timeout),
        timeout,
        agent,
      );
      return { ...result, durationMs: Date.now() - startTime };
    }

    // Priority 5: Stub (no AI configured)
    return await this.stubAgentExecution(agent, input, startTime);
  }

  /**
   * Execute a human-in-the-loop step — pauses until approve() or reject() is called.
   */
  private async executeHumanStep(
    agent: TeamAgent,
    input: Record<string, unknown>,
    _timeout: number,
    startTime: number,
    sessionId: string,
  ): Promise<StepResult> {
    const approvalTimeout = agent.approval_timeout ?? 300_000; // default 5 min

    const pending: PendingApproval = {
      sessionId,
      role: agent.role,
      agentRef: agent.agent_ref,
      input,
      startedAt: Date.now(),
      timeout: approvalTimeout,
    };

    this.pendingApprovals.set(sessionId, pending);
    this.emit('awaitingApproval', pending);
    log.info('team.human.awaiting_approval', { sessionId, role: agent.role, timeout: approvalTimeout });

    return new Promise<StepResult>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.pendingApprovals.delete(sessionId);
        this.pendingApprovalResolvers.delete(sessionId);
        log.warn('team.human.timeout', { sessionId, role: agent.role });
        resolve({
          role: agent.role,
          agentRef: agent.agent_ref,
          status: 'failed',
          input,
          output: { role: agent.role },
          durationMs: Date.now() - startTime,
          error: `Approval timed out after ${approvalTimeout}ms`,
          retries: 0,
        });
      }, approvalTimeout);

      this.pendingApprovalResolvers.set(sessionId, {
        resolve: (data: Record<string, unknown>) => {
          clearTimeout(timeoutId);
          this.pendingApprovals.delete(sessionId);
          this.pendingApprovalResolvers.delete(sessionId);
          log.info('team.human.approved', { sessionId, role: agent.role });
          resolve({
            role: agent.role,
            agentRef: agent.agent_ref,
            status: 'completed',
            input,
            output: { role: agent.role, ...data },
            durationMs: Date.now() - startTime,
            retries: 0,
          });
        },
        reject: (reason: string) => {
          clearTimeout(timeoutId);
          this.pendingApprovals.delete(sessionId);
          this.pendingApprovalResolvers.delete(sessionId);
          log.warn('team.human.rejected', { sessionId, role: agent.role, reason });
          resolve({
            role: agent.role,
            agentRef: agent.agent_ref,
            status: 'failed',
            input,
            output: { role: agent.role },
            durationMs: Date.now() - startTime,
            error: reason,
            retries: 0,
          });
        },
      });
    });
  }

  /**
   * Execute a nested sub-team — recursively calls TeamEngine.execute().
   */
  private async executeSubTeam(
    subTeam: TeamConfig,
    input: Record<string, unknown>,
    timeout: number,
    startTime: number,
  ): Promise<StepResult> {
    log.info('team.sub_team.start', { subTeamName: subTeam.name });
    const subResult = await this.execute(subTeam, input, { timeout });

    const status: StepResult['status'] = subResult.status === 'completed' ? 'completed' : 'failed';

    log.info('team.sub_team.complete', { subTeamName: subTeam.name, status });

    return {
      role: subTeam.name,
      agentRef: `sub-team:${subTeam.name}`,
      status,
      input,
      output: { sub_team: subTeam.name, ...subResult.aggregatedOutput },
      durationMs: Date.now() - startTime,
      error: subResult.errors.length > 0 ? subResult.errors.join('; ') : undefined,
      retries: 0,
    };
  }

  /**
   * Execute using the configured AiProvider.
   */
  private async executeWithAiProvider(
    agent: TeamAgent,
    input: Record<string, unknown>,
    timeout: number,
    startTime: number,
  ): Promise<StepResult> {
    const systemPrompt = agent.system_prompt ?? `You are the ${agent.role}. Complete the task based on the provided input.`;
    const userContent = JSON.stringify(input, null, 2);

    const result = await this.executeWithTimeout(
      () => this.aiProvider!.execute(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        { timeout, temperature: 0.7 },
      ),
      timeout,
      agent,
    );

    // Parse AI response into structured output
    let parsedOutput: Record<string, unknown>;
    try {
      parsedOutput = JSON.parse(result.content);
    } catch {
      // If the AI didn't return JSON, wrap as text
      parsedOutput = {
        role: agent.role,
        summary: result.content.slice(0, 500),
        raw: result.content,
      };
    }

    return {
      role: agent.role,
      agentRef: agent.agent_ref,
      status: 'completed',
      input,
      output: { role: agent.role, ...parsedOutput },
      durationMs: Date.now() - startTime,
      retries: 0,
    };
  }

  /**
   * Execute a promise with timeout.
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    agent: TeamAgent,
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Step "${agent.role}" timed out after ${timeout}ms`)), timeout);
      }),
    ]);
  }

  /**
   * Stub agent execution — produces placeholder output.
   */
  private async stubAgentExecution(
    agent: TeamAgent,
    input: Record<string, unknown>,
    startTime: number,
  ): Promise<StepResult> {
    await sleep(100 + Math.random() * 200);

    const prompt = agent.system_prompt ?? `You are the ${agent.role}`;

    return {
      role: agent.role,
      agentRef: agent.agent_ref,
      status: 'completed',
      input,
      output: {
        role: agent.role,
        summary: `[Stub] Agent "${agent.role}" processed input with prompt: ${prompt.slice(0, 50)}...`,
        prompt,
      },
      retries: 0,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Get number of active executions.
   */
  getActiveCount(): number {
    return this.activeCount;
  }
}
