/**
 * Run a stored `workflow` asset through TeamEngine.
 *
 * Workflow assets hold YAML (JSON is valid YAML). Two shapes are accepted:
 *   - a full TeamConfig: { name, agents: [...], workflow: [{ from, to }] }
 *   - a bare step list, either `{ steps: [...] }` or a top-level array;
 *     agents are then synthesised from the roles referenced by `from` / `to`.
 *
 * The complete result is returned to the caller, so REST does not need the
 * team session tables; pass `skipPersistence: false` to record an execution.
 */
import yaml from 'js-yaml';
import { getAsset, readAssetContent } from '../store/assets.js';
import { TeamEngine } from './team-engine.js';
import { createAiProviderFromEnv } from '../ai/provider.js';
import type { AiProvider } from '../ai/provider.js';
import type { ExecutionOptions, TeamExecutionResult } from './team-engine.js';
import type { TeamAgent, TeamConfig, TeamWorkflowStep } from '../types.js';

export interface WorkflowRunOptions {
  timeout?: number;
  /** Override agent execution (tests / dry runs). */
  agentHandler?: ExecutionOptions['agentHandler'];
  /** Inject a provider explicitly; otherwise it is built from the environment. */
  aiProvider?: AiProvider;
  skipPersistence?: boolean;
}

export interface WorkflowRunResult extends TeamExecutionResult {
  /** true when no AI provider or handler was supplied and steps used the local stub. */
  simulated: boolean;
}

/** Parse workflow YAML/JSON into a TeamConfig, synthesising agents for bare step lists. */
export function parseWorkflowConfig(content: string, fallbackName = 'workflow'): TeamConfig {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (e) {
    throw new Error(`Invalid workflow YAML: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Workflow content must be a YAML mapping or a list of steps');
  }

  const raw = Array.isArray(parsed)
    ? { workflow: parsed as TeamWorkflowStep[] }
    : parsed as Partial<TeamConfig> & { steps?: TeamWorkflowStep[] };
  const steps = raw.workflow ?? raw.steps;

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('Workflow content must define a non-empty "workflow" (or "steps") list');
  }
  for (const step of steps) {
    if (!step || typeof step.from !== 'string' || typeof step.to !== 'string') {
      throw new Error('Every workflow step needs string "from" and "to" roles');
    }
  }

  return {
    name: raw.name ?? fallbackName,
    version: raw.version ?? '1.0.0',
    ...(raw.description ? { description: raw.description } : {}),
    agents: raw.agents ?? synthesiseAgents(steps),
    workflow: steps,
    ...(raw.variables ? { variables: raw.variables } : {}),
    ...(raw.retry ? { retry: raw.retry } : {}),
    ...(raw.timeout !== undefined ? { timeout: raw.timeout } : {}),
    ...(raw.webhook ? { webhook: raw.webhook } : {}),
  };
}

function synthesiseAgents(steps: TeamWorkflowStep[]): TeamAgent[] {
  const roles = new Set<string>();
  for (const step of steps) {
    roles.add(step.from);
    roles.add(step.to);
  }
  return [...roles].map(role => ({ role, agent_ref: role, required: true }));
}

/** Execute a workflow asset by id with the supplied input. */
export async function executeWorkflowAsset(
  workflowId: string,
  input: Record<string, unknown> = {},
  options: WorkflowRunOptions = {},
): Promise<WorkflowRunResult> {
  if (typeof workflowId !== 'string' || !workflowId.trim()) {
    throw new Error('workflowId is required');
  }

  const asset = await getAsset(workflowId);
  if (!asset) throw new Error(`Workflow not found: ${workflowId}`);
  if (asset.type !== 'workflow') {
    throw new Error(`Asset ${workflowId} is a "${asset.type}", not a workflow`);
  }

  const config = parseWorkflowConfig(await readAssetContent(workflowId), asset.name);
  const provider = options.aiProvider ?? createAiProviderFromEnv();
  const engine = new TeamEngine({ aiProvider: provider });
  const result = await engine.execute(config, input, {
    ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
    ...(options.agentHandler ? { agentHandler: options.agentHandler } : {}),
    skipPersistence: options.skipPersistence ?? true,
  });

  return {
    ...result,
    simulated: !provider && !options.agentHandler,
  };
}
