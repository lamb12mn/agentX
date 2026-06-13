/**
 * MCP Sandbox — resource-limited child process execution.
 *
 * Provides operational limits (timeout, memory) for running MCP server
 * commands. Uses Node.js child_process.spawn() with termination on timeout.
 *
 * ⚠️ LIMITATION: This is NOT a security boundary.
 * child_process.spawn() runs with the same OS user permissions.
 * True sandbox isolation requires Docker, gVisor, or WASM-based containers.
 * This module prevents resource exhaustion only (runaway processes,
 * memory leaks).
 *
 * Environment variables:
 *   AGENTX_MCP_TIMEOUT     — Default timeout in ms (default: 30000)
 *   AGENTX_MCP_MAX_MEMORY  — Default memory limit in MB (default: 512)
 *   AGENTX_MCP_ENV_ALLOW   — Comma-separated list of env vars to pass through
 */

import { spawn } from 'child_process';
import { hrtime } from 'process';

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_MEMORY_MB = 512;
const KILL_WAIT_MS = 2_000; // Grace period between SIGTERM and SIGKILL

const ENV_TIMEOUT = 'AGENTX_MCP_TIMEOUT';
const ENV_MAX_MEMORY = 'AGENTX_MCP_MAX_MEMORY';
const ENV_ALLOW_LIST = 'AGENTX_MCP_ENV_ALLOW';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SandboxOptions {
  /** Maximum execution time in milliseconds. Default: 30000 */
  maxDuration?: number;
  /** Memory limit in MB (applied via --max-old-space-size for Node.js). Default: 512 */
  maxMemory?: number;
  /** Whitelisted environment variables to pass to the child process */
  envVars?: Record<string, string>;
  /** Working directory for the child process */
  cwd?: string;
}

export interface SandboxResult {
  /** Captured stdout content */
  stdout: string;
  /** Captured stderr content */
  stderr: string;
  /** Exit code (null if process was killed) */
  exitCode: number | null;
  /** Actual execution duration in milliseconds */
  duration: number;
  /** Whether the process was killed due to timeout */
  timedOut: boolean;
  /** Signal that terminated the process, if any */
  signal?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function envInt(key: string, defaultVal: number): number {
  const val = process.env[key];
  if (val === undefined) return defaultVal;
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultVal;
}

function parseEnvAllowList(): string[] {
  const raw = process.env[ENV_ALLOW_LIST];
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Build a filtered environment for the child process.
 * Only passes through explicitly allowed env vars from the host.
 */
function buildChildEnv(extraVars?: Record<string, string>): Record<string, string> {
  const allowed = parseEnvAllowList();

  // If no allowlist configured, pass through all env vars (default for backward compat)
  // But merge in any extraVars provided
  const base: Record<string, string> =
    allowed.length === 0
      ? { ...process.env as Record<string, string> }
      : {};

  // Whitelist mode: only pass through the explicitly allowed vars
  if (allowed.length > 0) {
    for (const key of allowed) {
      const val = process.env[key];
      if (val !== undefined) {
        base[key] = val;
      }
    }
  }

  // Merge in any overrides / additions
  if (extraVars) {
    Object.assign(base, extraVars);
  }

  // Apply Node.js memory limit
  const maxMem = envInt(ENV_MAX_MEMORY, DEFAULT_MAX_MEMORY_MB);
  // Let the caller override maxMemory via options, but also respect env var
  // The memory limit will be handled via NODE_OPTIONS below

  return base;
}

// ── McpSandbox ──────────────────────────────────────────────────────────────

export class McpSandbox {
  private executionCount = 0;
  private totalDuration = 0;

  /**
   * Run a command in a resource-limited child process.
   *
   * @param command  The command to run (e.g. 'node', 'python3')
   * @param args     Arguments array (e.g. ['server.js', '--port', '3000'])
   * @param options  Optional limits and configuration
   * @returns        Captured output, exit code, and timing info
   *
   * @example
   *   const sandbox = new McpSandbox();
   *   const result = await sandbox.execute('node', ['-e', 'console.log("hello")']);
   *   console.log(result.stdout); // "hello\n"
   *   console.log(result.exitCode); // 0
   */
  async execute(
    command: string,
    args: string[] = [],
    options?: SandboxOptions,
  ): Promise<SandboxResult> {
    const startTime = hrtime.bigint();
    const timeout = options?.maxDuration ?? envInt(ENV_TIMEOUT, DEFAULT_TIMEOUT_MS);
    const maxMem = options?.maxMemory ?? envInt(ENV_MAX_MEMORY, DEFAULT_MAX_MEMORY_MB);

    const childEnv = buildChildEnv(options?.envVars);

    // Inject memory limit via NODE_OPTIONS for Node.js processes
    if (command === 'node' || command.endsWith('/node') || command.endsWith('\\node.exe')) {
      childEnv.NODE_OPTIONS = `--max-old-space-size=${maxMem}`;
    }

    return new Promise<SandboxResult>((resolve) => {
      let timedOut = false;
      let killed = false;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.keys(childEnv).length > 0 ? childEnv : undefined,
        cwd: options?.cwd,
        // Windows: use shell for .bat/.cmd files; use 'node' directly for Node.js scripts
        shell: process.platform === 'win32' && (command.endsWith('.bat') || command.endsWith('.cmd')),
      });

      // Capture stdout
      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      // Capture stderr
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      // Timeout timer
      const timer = setTimeout(() => {
        timedOut = true;
        killed = true;
        // Try graceful SIGTERM first
        child.kill('SIGTERM');

        // Force SIGKILL after grace period
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // Process already dead
          }
        }, KILL_WAIT_MS);
      }, timeout);

      child.on('close', (exitCode, signal) => {
        clearTimeout(timer);
        const endTime = hrtime.bigint();
        const duration = Number(endTime - startTime) / 1_000_000; // nanoseconds → ms

        this.executionCount++;
        this.totalDuration += duration;

        const result: SandboxResult = {
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
          exitCode: killed ? null : exitCode,
          duration: Math.round(duration),
          timedOut,
          signal: signal ?? undefined,
        };
        resolve(result);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        const endTime = hrtime.bigint();
        const duration = Number(endTime - startTime) / 1_000_000;

        this.executionCount++;

        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: err.message,
          exitCode: null,
          duration: Math.round(duration),
          timedOut: false,
          signal: undefined,
        });
      });
    });
  }

  // ── Statistics ───────────────────────────────────────────────────────────

  /** Number of processes executed through this sandbox instance */
  get executions(): number {
    return this.executionCount;
  }

  /** Total cumulative duration of all executed processes in ms */
  get totalCpuTime(): number {
    return Math.round(this.totalDuration);
  }

  /** Reset execution statistics */
  resetStats(): void {
    this.executionCount = 0;
    this.totalDuration = 0;
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /** Default timeout from env or constant */
  static defaultTimeout(): number {
    return envInt(ENV_TIMEOUT, DEFAULT_TIMEOUT_MS);
  }

  /** Default memory limit from env or constant */
  static defaultMaxMemory(): number {
    return envInt(ENV_MAX_MEMORY, DEFAULT_MAX_MEMORY_MB);
  }
}
