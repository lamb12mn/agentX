/**
 * Execution Session Store — persists team execution state to SQLite.
 *
 * Provides read/write operations for execution sessions and step results,
 * enabling cross-restart recovery and execution history queries.
 */

import { getDb } from './db.js';
import type { TeamExecutionResult, StepResult, TeamExecutionStatus } from '../orchestrator/team-engine.js';

// ── Row types (DB ↔ domain) ─────────────────────────────────────────────────

interface SessionRow {
  session_id: string;
  team_name: string;
  team_config: string;
  status: string;
  input: string | null;
  aggregated_output: string | null;
  total_duration_ms: number | null;
  started_at: number;
  completed_at: number | null;
  errors: string | null;
}

interface StepRow {
  id: number;
  session_id: string;
  role: string;
  agent_ref: string;
  status: string;
  input: string | null;
  output: string | null;
  error: string | null;
  retries: number;
  duration_ms: number | null;
  step_index: number;
  started_at: number;
}

// ── Table initialisation ─────────────────────────────────────────────────────

export function ensureExecutionTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS execution_sessions (
      session_id TEXT PRIMARY KEY,
      team_name TEXT NOT NULL,
      team_config TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      input TEXT,
      aggregated_output TEXT,
      total_duration_ms INTEGER,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      errors TEXT
    );

    CREATE TABLE IF NOT EXISTS execution_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES execution_sessions(session_id),
      role TEXT NOT NULL,
      agent_ref TEXT NOT NULL,
      status TEXT NOT NULL,
      input TEXT,
      output TEXT,
      error TEXT,
      retries INTEGER DEFAULT 0,
      duration_ms INTEGER,
      step_index INTEGER NOT NULL,
      started_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_exec_steps_session ON execution_steps(session_id);
    CREATE INDEX IF NOT EXISTS idx_exec_sessions_status ON execution_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_exec_sessions_started ON execution_sessions(started_at DESC);
  `);
}

// ── Write operations ─────────────────────────────────────────────────────────

export function insertSession(
  sessionId: string,
  teamName: string,
  teamConfig: string,
  input: Record<string, unknown>,
  startedAt: number,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO execution_sessions (session_id, team_name, team_config, status, input, started_at)
    VALUES (?, ?, ?, 'running', ?, ?)
  `).run(sessionId, teamName, teamConfig, JSON.stringify(input), startedAt);
}

export function updateSessionStatus(
  sessionId: string,
  status: string,
  aggregatedOutput: Record<string, unknown>,
  totalDurationMs: number,
  errors: string[],
): void {
  const db = getDb();
  db.prepare(`
    UPDATE execution_sessions
    SET status = ?, aggregated_output = ?, total_duration_ms = ?, completed_at = ?, errors = ?
    WHERE session_id = ?
  `).run(
    status,
    JSON.stringify(aggregatedOutput),
    totalDurationMs,
    Date.now(),
    JSON.stringify(errors),
    sessionId,
  );
}

export function insertStep(
  sessionId: string,
  step: StepResult,
  stepIndex: number,
  startedAt: number,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO execution_steps (session_id, role, agent_ref, status, input, output, error, retries, duration_ms, step_index, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    step.role,
    step.agentRef,
    step.status,
    JSON.stringify(step.input),
    JSON.stringify(step.output),
    step.error ?? null,
    step.retries,
    step.durationMs,
    stepIndex,
    startedAt,
  );
}

// ── Read operations ──────────────────────────────────────────────────────────

export function getExecutionStatus(sessionId: string): TeamExecutionStatus | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT session_id, team_name, status, started_at, completed_at FROM execution_sessions WHERE session_id = ?',
  ).get(sessionId) as Pick<SessionRow, 'session_id' | 'team_name' | 'status' | 'started_at' | 'completed_at'> | undefined;

  if (!row) return null;

  return {
    sessionId: row.session_id,
    teamName: row.team_name,
    status: row.status as TeamExecutionStatus['status'],
    currentStep: null,
    progress: row.status === 'completed' ? 100 : 0,
    startedAt: row.started_at,
    estimatedCompletion: row.completed_at ?? null,
  };
}

export function getExecutionResult(sessionId: string): TeamExecutionResult | null {
  const db = getDb();

  const session = db.prepare(
    'SELECT * FROM execution_sessions WHERE session_id = ?',
  ).get(sessionId) as SessionRow | undefined;

  if (!session) return null;

  const stepRows = db.prepare(
    'SELECT * FROM execution_steps WHERE session_id = ? ORDER BY step_index ASC',
  ).all(sessionId) as StepRow[];

  const steps: StepResult[] = stepRows.map(r => ({
    role: r.role,
    agentRef: r.agent_ref,
    status: r.status as StepResult['status'],
    input: JSON.parse(r.input ?? '{}'),
    output: JSON.parse(r.output ?? '{}'),
    durationMs: r.duration_ms ?? 0,
    error: r.error ?? undefined,
    retries: r.retries,
  }));

  return {
    sessionId: session.session_id,
    status: session.status as TeamExecutionResult['status'],
    steps,
    aggregatedOutput: JSON.parse(session.aggregated_output ?? '{}'),
    totalDurationMs: session.total_duration_ms ?? 0,
    errors: JSON.parse(session.errors ?? '[]'),
  };
}

export interface ExecutionHistoryEntry {
  sessionId: string;
  teamName: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  totalDurationMs: number | null;
  stepCount: number;
}

export function listExecutionHistory(
  limit = 20,
  offset = 0,
): ExecutionHistoryEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      s.session_id, s.team_name, s.status, s.started_at,
      s.completed_at, s.total_duration_ms,
      (SELECT COUNT(*) FROM execution_steps WHERE session_id = s.session_id) AS step_count
    FROM execution_sessions s
    ORDER BY s.started_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as Array<{
    session_id: string;
    team_name: string;
    status: string;
    started_at: number;
    completed_at: number | null;
    total_duration_ms: number | null;
    step_count: number;
  }>;

  return rows.map(r => ({
    sessionId: r.session_id,
    teamName: r.team_name,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    totalDurationMs: r.total_duration_ms,
    stepCount: r.step_count,
  }));
}

export function getStepLogs(sessionId: string): StepRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM execution_steps WHERE session_id = ? ORDER BY step_index ASC',
  ).all(sessionId) as StepRow[];
}
