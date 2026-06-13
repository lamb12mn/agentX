import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { Command } from 'commander';

describe('CLI commands', () => {
  it('registers all asset management commands', async () => {
    const { registerListCommand } = await import('../../src/cli/commands/list.js');
    const { registerSearchCommand } = await import('../../src/cli/commands/search.js');
    const { registerInfoCommand } = await import('../../src/cli/commands/info.js');
    const { registerGetCommand } = await import('../../src/cli/commands/get.js');
    const { registerDeleteCommand } = await import('../../src/cli/commands/delete.js');
    const { registerCreateCommand } = await import('../../src/cli/commands/create.js');

    const program = new Command();
    registerListCommand(program);
    registerSearchCommand(program);
    registerInfoCommand(program);
    registerGetCommand(program);
    registerDeleteCommand(program);
    registerCreateCommand(program);

    const commands = program.commands.map(c => c.name());
    expect(commands).toContain('list');
    expect(commands).toContain('search');
    expect(commands).toContain('info');
    expect(commands).toContain('get');
    expect(commands).toContain('delete');
    expect(commands).toContain('create');
  });

  it('registers batch and clone commands', async () => {
    const { registerBatchCommand } = await import('../../src/cli/commands/batch.js');
    const { registerCloneCommand } = await import('../../src/cli/commands/clone.js');

    const program = new Command();
    registerBatchCommand(program);
    registerCloneCommand(program);

    const commands = program.commands.map(c => c.name());
    expect(commands).toContain('delete');
    expect(commands).toContain('tag');
    expect(commands).toContain('clone');
  });

  it('registers diagnostic commands', async () => {
    const { registerDoctorCommand } = await import('../../src/cli/commands/doctor.js');
    const { registerInitCommand } = await import('../../src/cli/commands/init.js');

    const program = new Command();
    registerDoctorCommand(program);
    registerInitCommand(program);

    const commands = program.commands.map(c => c.name());
    expect(commands).toContain('doctor');
    expect(commands).toContain('init');
  });

  it('registers mcp send command', async () => {
    const { registerMcpSend } = await import('../../src/cli/commands/mcp/send.js');
    const program = new Command();
    const mcp = program.command('mcp');
    registerMcpSend(mcp);
    expect(mcp.commands.map(c => c.name())).toContain('send');
  });

  it('cli.ts entry module file exists', () => {
    expect(existsSync('src/cli.ts')).toBe(true);
  });
});
