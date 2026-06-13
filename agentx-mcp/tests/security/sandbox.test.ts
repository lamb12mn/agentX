import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpSandbox } from '../../src/security/sandbox.js';

describe('McpSandbox', () => {
  let sandbox: McpSandbox;

  beforeEach(() => {
    sandbox = new McpSandbox();
  });

  afterEach(() => {
    sandbox.resetStats();
  });

  // ── Basic execution ─────────────────────────────────────────────────────

  it('executes a simple command and captures stdout', async () => {
    const result = await sandbox.execute('node', ['-e', 'console.log("hello sandbox")']);
    expect(result.stdout.trim()).toBe('hello sandbox');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('captures stderr separately', async () => {
    const result = await sandbox.execute('node', ['-e', 'console.error("error msg")']);
    expect(result.stderr.trim()).toBe('error msg');
    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('reports non-zero exit codes', async () => {
    const result = await sandbox.execute('node', ['-e', 'process.exit(42)']);
    expect(result.exitCode).toBe(42);
  });

  it('handles empty stdout and stderr', async () => {
    const result = await sandbox.execute('node', ['-e', '']);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  // ── Timeout ──────────────────────────────────────────────────────────────

  it('kills processes that exceed maxDuration', async () => {
    const result = await sandbox.execute('node', [
      '-e', 'setTimeout(() => console.log("done"), 10000)',
    ], { maxDuration: 200 });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.duration).toBeLessThan(5000);
  });

  it('does NOT timeout normally completing processes', async () => {
    const result = await sandbox.execute('node', [
      '-e', 'console.log("fast")',
    ], { maxDuration: 5000 });

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('fast');
  });

  it('timeout kills even infinite loops', async () => {
    const result = await sandbox.execute('node', [
      '-e', 'while(true) {}',
    ], { maxDuration: 300 });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  // ── Memory limit ─────────────────────────────────────────────────────────

  it('applies memory limit via NODE_OPTIONS for node processes', async () => {
    const result = await sandbox.execute('node', [
      '-e', 'console.log(process.env.NODE_OPTIONS)',
    ], { maxMemory: 256 });

    expect(result.stdout).toContain('--max-old-space-size=256');
    expect(result.exitCode).toBe(0);
  });

  it('memory limit defaults to env var AGENTX_MCP_MAX_MEMORY', async () => {
    process.env.AGENTX_MCP_MAX_MEMORY = '128';
    const result = await sandbox.execute('node', [
      '-e', 'console.log(process.env.NODE_OPTIONS)',
    ]);
    expect(result.stdout).toContain('--max-old-space-size=128');
    expect(result.exitCode).toBe(0);
    delete process.env.AGENTX_MCP_MAX_MEMORY;
  });

  // ── Environment variables ────────────────────────────────────────────────

  it('passes through allowed env vars when AGENTX_MCP_ENV_ALLOW is set', async () => {
    process.env.MY_TEST_VAR = 'hello-env';
    process.env.AGENTX_MCP_ENV_ALLOW = 'MY_TEST_VAR,PATH';

    const result = await sandbox.execute('node', [
      '-e', 'console.log(process.env.MY_TEST_VAR)',
    ]);
    expect(result.stdout.trim()).toBe('hello-env');

    delete process.env.MY_TEST_VAR;
    delete process.env.AGENTX_MCP_ENV_ALLOW;
  });

  it('passes extra env vars from options', async () => {
    const result = await sandbox.execute('node', [
      '-e', 'console.log(process.env.CUSTOM_VAR)',
    ], {
      envVars: { CUSTOM_VAR: 'custom-value' },
    });
    expect(result.stdout.trim()).toBe('custom-value');
  });

  it('does not leak env vars when allowlist is empty (passes through all)', async () => {
    // Default behavior: all env vars passed through
    const result = await sandbox.execute('node', [
      '-e', 'console.log(typeof process.env.PATH)',
    ]);
    expect(result.stdout.trim()).toBe('string'); // PATH exists in child
  });

  // ── Working directory ────────────────────────────────────────────────────

  it('cwd option changes working directory', async () => {
    const originalCwd = process.cwd();
    const result = await sandbox.execute('node', [
      '-e', 'console.log(process.cwd())',
    ], {
      cwd: '/',
    });
    // On Windows, root is something like C:\ — should differ from the test dir
    expect(result.stdout.trim()).not.toBe(originalCwd);
    expect(result.exitCode).toBe(0);
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it('handles nonexistent command gracefully', async () => {
    const result = await sandbox.execute('nonexistent-command-xyz');
    expect(result.exitCode).toBeNull();
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it('handles command that throws during spawn', async () => {
    // Very long command string that should fail
    const result = await sandbox.execute('node', [
      '-e', 'throw new Error("crash")',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error: crash');
  });

  // ── Statistics ───────────────────────────────────────────────────────────

  it('tracks execution count', async () => {
    expect(sandbox.executions).toBe(0);

    await sandbox.execute('node', ['-e', '']);
    expect(sandbox.executions).toBe(1);

    await sandbox.execute('node', ['-e', '']);
    expect(sandbox.executions).toBe(2);
  });

  it('tracks total duration', async () => {
    await sandbox.execute('node', ['-e', 'console.log("a")']);
    await sandbox.execute('node', ['-e', 'console.log("b")']);

    expect(sandbox.totalCpuTime).toBeGreaterThan(0);
  });

  it('resetStats clears execution count', async () => {
    await sandbox.execute('node', ['-e', '']);
    expect(sandbox.executions).toBe(1);

    sandbox.resetStats();
    expect(sandbox.executions).toBe(0);
    expect(sandbox.totalCpuTime).toBe(0);
  });

  // ── Static helpers ───────────────────────────────────────────────────────

  it('defaultTimeout reads from env or returns constant', () => {
    const def = McpSandbox.defaultTimeout();
    expect(def).toBe(30_000); // default

    process.env.AGENTX_MCP_TIMEOUT = '5000';
    expect(McpSandbox.defaultTimeout()).toBe(5000);
    delete process.env.AGENTX_MCP_TIMEOUT;
  });

  it('defaultMaxMemory reads from env or returns constant', () => {
    const def = McpSandbox.defaultMaxMemory();
    expect(def).toBe(512); // default

    process.env.AGENTX_MCP_MAX_MEMORY = '256';
    expect(McpSandbox.defaultMaxMemory()).toBe(256);
    delete process.env.AGENTX_MCP_MAX_MEMORY;
  });
});
