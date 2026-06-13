/**
 * Team-related MCP tool definitions
 *
 * 10 tools for multi-agent orchestration:
 *   team.create  — Create a team definition from YAML config
 *   team.run     — Execute a team workflow with input
 *   team.status  — Check execution status
 *   team.results — Get aggregated results
 *   team.cancel  — Cancel a running execution
 *   team.history — List execution history
 *   team.logs    — Get step logs for a session
 *   team.approve — Approve a pending human-in-the-loop step (Phase B)
 *   team.reject  — Reject a pending approval (Phase B)
 *   team.pending — List all pending approvals (Phase B)
 */

import { createAsset, getAsset, listAssets, readAssetContent } from '../store/assets.js';
import { TeamEngine } from '../orchestrator/team-engine.js';
import type { TeamConfig } from '../types.js';

// ── Shared engine instance ──────────────────────────────────────────────────

const engine = new TeamEngine();

// ── Tool handler interface ──────────────────────────────────────────────────

interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

// ── Tool registrations ──────────────────────────────────────────────────────

export function registerTeamTools(baseDir: string): Record<string, ToolHandler<never, unknown>> {
  return {
    'team.create': {
      description:
        'Create a multi-agent team definition from a TeamConfig object. ' +
        'Teams define a pipeline of agents (researcher → writer → reviewer) with workflow steps.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Team name (unique identifier)',
          },
          config: {
            type: 'object',
            description: 'TeamConfig object with agents, workflow, and options',
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              description: { type: 'string' },
              agents: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    role: { type: 'string' },
                    agent_ref: { type: 'string' },
                    system_prompt: { type: 'string' },
                    required: { type: 'boolean' },
                    agent_type: { type: 'string', enum: ['ai', 'human'] },
                    approval_timeout: { type: 'number' },
                  },
                  required: ['role', 'agent_ref'],
                },
              },
              workflow: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    condition: { type: 'string' },
                    input_template: { type: 'string' },
                    sub_team: { type: 'object' },
                  },
                  required: ['from', 'to'],
                },
              },
              variables: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    source: { type: 'string', enum: ['input', 'step_output'] },
                    step_role: { type: 'string' },
                    field: { type: 'string' },
                  },
                  required: ['name', 'source'],
                },
              },
              retry: {
                type: 'object',
                properties: {
                  maxRetries: { type: 'number' },
                  backoffMs: { type: 'number' },
                },
              },
              timeout: { type: 'number' },
              webhook: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  events: {
                    type: 'array',
                    items: { type: 'string', enum: ['start', 'step.complete', 'step.failed', 'complete', 'all'] },
                  },
                  headers: { type: 'object' },
                },
                required: ['url', 'events'],
              },
            },
            required: ['name', 'version', 'agents', 'workflow'],
          },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'config'],
      },
      handler: async (input: { name: string; config: TeamConfig; description?: string; tags?: string[] }) => {
        TeamEngine.validateConfig(input.config);
        if (input.config.name !== input.name) {
          input.config.name = input.name;
        }
        const content = JSON.stringify(input.config, null, 2);
        return createAsset(
          {
            type: 'team',
            name: input.name,
            description: input.description ?? input.config.description,
            tags: input.tags ?? ['team'],
          },
          content,
          baseDir,
        );
      },
    },

    'team.run': {
      description:
        'Execute a team workflow with the given input. Returns a TeamExecutionResult ' +
        'with step-by-step status, outputs, and aggregated results.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Team asset ID' },
          input: { type: 'object', description: 'Input data for the workflow' },
          maxRetries: { type: 'number', description: 'Max retries per step (default: from config)' },
          timeout: { type: 'number', description: 'Per-step timeout in ms (default: from config)' },
        },
        required: ['id'],
      },
      handler: async (params: { id: string; input?: Record<string, unknown>; maxRetries?: number; timeout?: number }) => {
        const asset = await getAsset(params.id);
        if (!asset) throw new Error(`Team not found: ${params.id}`);

        const content = await readAssetContent(params.id);
        const config: TeamConfig = JSON.parse(content);

        return engine.execute(config, params.input ?? {}, {
          maxRetries: params.maxRetries,
          timeout: params.timeout,
          skipPersistence: false,
        });
      },
    },

    'team.status': {
      description: 'Check the execution status of a running or completed team workflow.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Execution session ID' },
        },
        required: ['sessionId'],
      },
      handler: async (input: { sessionId: string }) => {
        const status = engine.getStatus(input.sessionId);
        if (!status) throw new Error(`Session not found: ${input.sessionId}`);
        return status;
      },
    },

    'team.results': {
      description: 'Get the full execution results of a completed team workflow.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Execution session ID' },
        },
        required: ['sessionId'],
      },
      handler: async (input: { sessionId: string }) => {
        const results = engine.getResults(input.sessionId);
        if (!results) throw new Error(`Session not found: ${input.sessionId}`);
        return results;
      },
    },

    'team.cancel': {
      description: 'Cancel a running team workflow execution.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Execution session ID to cancel' },
        },
        required: ['sessionId'],
      },
      handler: async (input: { sessionId: string }) => {
        const cancelled = engine.cancel(input.sessionId);
        return { success: cancelled, sessionId: input.sessionId };
      },
    },

    'team.list': {
      description: 'List all team assets.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => listAssets('team'),
    },

    'team.history': {
      description: 'List execution history with pagination.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default 20)' },
          offset: { type: 'number', description: 'Offset for pagination (default 0)' },
        },
      },
      handler: async (input: { limit?: number; offset?: number }) => {
        return engine.getHistory(input.limit, input.offset);
      },
    },

    'team.logs': {
      description: 'Get detailed step logs for a completed execution session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Execution session ID' },
        },
        required: ['sessionId'],
      },
      handler: async (input: { sessionId: string }) => {
        const logs = engine.getStepLogs(input.sessionId);
        if (!logs || logs.length === 0) {
          throw new Error(`No logs found for session: ${input.sessionId}`);
        }
        return logs;
      },
    },

    'team.approve': {
      description:
        'Approve a pending human-in-the-loop step. ' +
        'Provide approval data that will be passed as the step output.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Execution session ID' },
          data: {
            type: 'object',
            description: 'Approval data to pass as step output',
          },
        },
        required: ['sessionId', 'data'],
      },
      handler: async (input: { sessionId: string; data: Record<string, unknown> }) => {
        const approved = engine.approve(input.sessionId, input.data);
        if (!approved) throw new Error(`No pending approval found for session: ${input.sessionId}`);
        return { success: true, sessionId: input.sessionId };
      },
    },

    'team.reject': {
      description: 'Reject a pending human-in-the-loop step with a reason.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Execution session ID' },
          reason: { type: 'string', description: 'Reason for rejection' },
        },
        required: ['sessionId', 'reason'],
      },
      handler: async (input: { sessionId: string; reason: string }) => {
        const rejected = engine.reject(input.sessionId, input.reason);
        if (!rejected) throw new Error(`No pending approval found for session: ${input.sessionId}`);
        return { success: true, sessionId: input.sessionId };
      },
    },

    'team.pending': {
      description: 'List all executions currently awaiting human approval.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => engine.getPendingApprovals(),
    },
  };
}
