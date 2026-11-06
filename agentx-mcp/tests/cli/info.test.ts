import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Command } from 'commander';
import { closeDb } from '../../src/store/db.js';
import { registerInfoCommand } from '../../src/cli/commands/info.js';

describe('agentx info', () => {
  const originalDir = process.env.AGENTX_DIR;
  let dir: string | undefined;

  afterEach(() => {
    closeDb();
    if (dir) rmSync(dir, { recursive: true, force: true });
    if (originalDir === undefined) delete process.env.AGENTX_DIR;
    else process.env.AGENTX_DIR = originalDir;
    vi.restoreAllMocks();
  });

  it('initializes the database before reading asset stats', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agentx-info-'));
    process.env.AGENTX_DIR = dir;
    closeDb();

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const program = new Command();
    registerInfoCommand(program);
    await program.parseAsync(['info'], { from: 'user' });

    expect(existsSync(join(dir, 'agentx.db'))).toBe(true);
    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('total:');
    expect(output).toContain('teams:');
  });
});
