/**
 * CLI team command group — manage multi-agent teams.
 *
 * Subcommands:
 *   create  — Create a team definition from YAML/JSON
 *   run     — Execute a team workflow with input
 *   list    — List all teams
 *   status  — Check execution status
 *   results — Get full execution results
 *   history — List execution history
 *   logs    — Get step logs for a session
 *   approve — Approve a pending human step
 *   reject  — Reject a pending human step
 *   pending — List pending approvals
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { createAsset, listAssets, readAssetContent } from '../../store/assets.js';
import { TeamEngine } from '../../orchestrator/team-engine.js';
import type { TeamConfig } from '../../types.js';
import { withDb } from '../common.js';

const engine = new TeamEngine();

function success(msg: string): void {
  console.log(chalk.green('✓'), msg);
}

function fail(msg: string, code = 1): never {
  console.error(chalk.red('✗'), msg);
  process.exit(code);
}

// ── Subcommand handlers ────────────────────────────────────────────────────

async function handleCreate(
  name: string,
  opts: { file?: string; description?: string; tags?: string },
): Promise<void> {
  let content: string;

  if (opts.file) {
    try {
      content = await readFile(opts.file, 'utf-8');
    } catch (e) {
      fail(`Cannot read file: ${opts.file} — ${(e as Error).message}`);
    }
  } else {
    // Provide a starter template
    const starter: TeamConfig = {
      name,
      version: '1.0.0',
      description: opts.description ?? `Team: ${name}`,
      agents: [
        { role: 'researcher', agent_ref: 'researcher-agent', required: true },
        { role: 'writer', agent_ref: 'writer-agent', required: true },
      ],
      workflow: [
        { from: 'researcher', to: 'writer' },
      ],
    };
    content = JSON.stringify(starter, null, 2);
  }

  // Validate JSON
  let config: TeamConfig;
  try {
    config = JSON.parse(content);
  } catch {
    fail('Invalid JSON — file must contain valid TeamConfig JSON');
  }

  const tags = opts.tags ? opts.tags.split(',').map(t => t.trim()).filter(Boolean) : ['team'];
  const asset = await createAsset(
    { type: 'team', name, description: config.description ?? opts.description, tags },
    content,
    process.cwd(),
  );

  success(`Created team: ${chalk.bold(name)} (${asset.id})`);
  console.log(chalk.dim(`  Agents: ${config.agents.map(a => a.role).join(' → ')}`));
  console.log(chalk.dim(`  Steps: ${config.workflow.length}`));
}

async function handleRun(
  idOrName: string,
  opts: { input?: string; timeout?: string },
): Promise<void> {
  // Find team by ID or name
  const teams = await listAssets('team');
  const team = teams.find(t => t.id === idOrName || t.name === idOrName);
  if (!team) fail(`Team not found: ${idOrName}`);

  const content = await readAssetContent(team.id);
  const config: TeamConfig = JSON.parse(content);

  let input: Record<string, unknown> = {};
  if (opts.input) {
    try {
      input = JSON.parse(opts.input);
    } catch {
      fail('Invalid JSON input — must be a valid JSON object');
    }
  }

  const timeout = opts.timeout ? parseInt(opts.timeout, 10) : undefined;

  console.log(chalk.blue(`▶ Running team "${config.name}"...`));
  const result = await engine.execute(config, input, { timeout });

  console.log();
  if (result.status === 'completed') {
    success(`Team execution completed in ${result.totalDurationMs}ms`);
  } else if (result.status === 'failed') {
    console.error(chalk.red(`✗ Team execution failed after ${result.totalDurationMs}ms`));
  } else if (result.status === 'cancelled') {
    console.log(chalk.yellow(`⚠ Team execution cancelled after ${result.totalDurationMs}ms`));
  } else {
    console.log(chalk.yellow(`⚠ Team execution partial — ${result.status}`));
  }

  console.log(chalk.dim(`  Session: ${result.sessionId}`));
  console.log(chalk.dim(`  Steps completed: ${result.steps.filter(s => s.status === 'completed').length}/${result.steps.length}`));

  if (result.errors.length > 0) {
    console.log(chalk.red('  Errors:'));
    for (const err of result.errors) {
      console.log(chalk.red(`    • ${err}`));
    }
  }

  console.log();
  console.log(chalk.bold('  Results:'));
  console.log(JSON.stringify(result.aggregatedOutput, null, 2));
}

async function handleList(): Promise<void> {
  const teams = await listAssets('team');
  if (teams.length === 0) {
    console.log(chalk.yellow('No teams found.'));
    return;
  }

  console.log(chalk.bold(`\n  ${teams.length} team(s):\n`));
  for (const team of teams) {
    const tags = team.tags.length > 0 ? chalk.dim(` [${team.tags.join(', ')}]`) : '';
    console.log(`  ${chalk.cyan('•')} ${chalk.bold(team.name)}${tags}`);
    console.log(chalk.dim(`    ID: ${team.id}`));
    if (team.description) {
      console.log(chalk.dim(`    ${team.description}`));
    }
  }
  console.log();
}

async function handleStatus(sessionId: string): Promise<void> {
  const status = engine.getStatus(sessionId);
  if (!status) fail(`Session not found: ${sessionId}`);

  const icon = status.status === 'completed' ? '✓'
    : status.status === 'failed' ? '✗'
    : status.status === 'cancelled' ? '⚠'
    : '▶';

  console.log(`${icon} ${chalk.bold(status.teamName)} — ${status.status}`);
  console.log(chalk.dim(`  Session: ${status.sessionId}`));
  console.log(chalk.dim(`  Progress: ${status.progress}%`));
  if (status.currentStep) {
    console.log(chalk.dim(`  Current step: ${status.currentStep}`));
  }
}

async function handleResults(sessionId: string): Promise<void> {
  const results = engine.getResults(sessionId);
  if (!results) fail(`Session not found: ${sessionId}`);

  const icon = results.status === 'completed' ? '✓'
    : results.status === 'failed' ? '✗'
    : results.status === 'cancelled' ? '⚠'
    : '▶';

  console.log(`${icon} ${chalk.bold(results.sessionId)} — ${results.status}`);
  console.log(chalk.dim(`  Duration: ${results.totalDurationMs}ms`));
  console.log(chalk.dim(`  Steps: ${results.steps.length}`));
  if (results.errors.length > 0) {
    console.log(chalk.red('  Errors:'));
    for (const err of results.errors) {
      console.log(chalk.red(`    • ${err}`));
    }
  }
  console.log();
  console.log(chalk.bold('  Output:'));
  console.log(JSON.stringify(results.aggregatedOutput, null, 2));
}

async function handleHistory(limitStr?: string): Promise<void> {
  const limit = limitStr ? parseInt(limitStr, 10) : 20;
  const entries = engine.getHistory(limit, 0);
  if (entries.length === 0) {
    console.log(chalk.yellow('No execution history found.'));
    return;
  }

  console.log(chalk.bold(`\n  ${entries.length} execution(s):\n`));
  for (const entry of entries) {
    const icon = entry.status === 'completed' ? '✓'
      : entry.status === 'failed' ? '✗'
      : entry.status === 'cancelled' ? '⚠'
      : '▶';

    console.log(`  ${chalk.cyan(icon)} ${chalk.bold(entry.teamName)} — ${entry.status}`);
    console.log(chalk.dim(`    Session: ${entry.sessionId}`));
    console.log(chalk.dim(`    Steps: ${entry.stepCount}`));
    if (entry.totalDurationMs) {
      console.log(chalk.dim(`    Duration: ${entry.totalDurationMs}ms`));
    }
  }
  console.log();
}

async function handleLogs(sessionId: string): Promise<void> {
  const logs = engine.getStepLogs(sessionId);
  if (!logs || logs.length === 0) {
    fail(`No logs found for session: ${sessionId}`);
  }

  console.log(chalk.bold(`\n  Step logs for session: ${sessionId}\n`));
  for (const entry of logs) {
    const icon = entry.status === 'completed' ? '✓' : entry.status === 'failed' ? '✗' : '⚠';
    console.log(`  ${chalk.cyan(icon)} ${chalk.bold(entry.role)} — ${entry.status}`);
    console.log(chalk.dim(`    Agent: ${entry.agent_ref}`));
    if (entry.duration_ms) console.log(chalk.dim(`    Duration: ${entry.duration_ms}ms`));
    if (entry.error) console.log(chalk.red(`    Error: ${entry.error}`));
    console.log();
  }
}

async function handleApprove(sessionId: string, data: string): Promise<void> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data);
  } catch {
    fail('Invalid JSON data for approval');
  }

  const approved = engine.approve(sessionId, parsed);
  if (!approved) fail(`No pending approval found for session: ${sessionId}`);
  success(`Approved session: ${sessionId}`);
}

async function handleReject(sessionId: string, reason: string): Promise<void> {
  const rejected = engine.reject(sessionId, reason);
  if (!rejected) fail(`No pending approval found for session: ${sessionId}`);
  success(`Rejected session: ${sessionId}`);
}

async function handlePending(): Promise<void> {
  const pending = engine.getPendingApprovals();
  if (pending.length === 0) {
    console.log(chalk.yellow('No pending approvals.'));
    return;
  }

  console.log(chalk.bold(`\n  ${pending.length} pending approval(s):\n`));
  for (const p of pending) {
    console.log(`  ${chalk.cyan('•')} ${chalk.bold(p.role)}`);
    console.log(chalk.dim(`    Session: ${p.sessionId}`));
    console.log(chalk.dim(`    Agent: ${p.agentRef}`));
    console.log(chalk.dim(`    Timeout: ${p.timeout}ms`));
  }
  console.log();
}

// ── Command registration ───────────────────────────────────────────────────

export function registerTeamCommand(program: Command): void {
  const team = program
    .command('team')
    .description('Multi-agent team orchestration');

  team
    .command('create <name>')
    .description('Create a team definition')
    .option('-f, --file <path>', 'Read team config from JSON file')
    .option('-d, --description <desc>', 'Team description')
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .action(withDb(handleCreate));

  team
    .command('run <id>')
    .description('Execute a team workflow')
    .option('-i, --input <json>', 'Input JSON for the workflow')
    .option('--timeout <ms>', 'Per-step timeout in ms')
    .action(withDb(handleRun));

  team
    .command('list')
    .description('List all teams')
    .action(withDb(handleList));

  team
    .command('status <sessionId>')
    .description('Check execution status')
    .action(withDb(handleStatus));

  team
    .command('results <sessionId>')
    .description('Get full execution results')
    .action(withDb(handleResults));

  team
    .command('history [limit]')
    .description('List execution history')
    .action(withDb(handleHistory));

  team
    .command('logs <sessionId>')
    .description('Get step logs for a session')
    .action(withDb(handleLogs));

  team
    .command('approve <sessionId> <data>')
    .description('Approve a pending human step (data must be JSON)')
    .action(withDb(handleApprove));

  team
    .command('reject <sessionId> <reason>')
    .description('Reject a pending human step')
    .action(withDb(handleReject));

  team
    .command('pending')
    .description('List all pending approvals')
    .action(withDb(handlePending));
}
