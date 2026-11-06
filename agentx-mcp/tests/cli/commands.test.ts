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

  it('registers batch subcommands under the batch group', async () => {
    const { registerBatchCommand } = await import('../../src/cli/commands/batch.js');
    const { registerCloneCommand } = await import('../../src/cli/commands/clone.js');

    const program = new Command();
    const batch = program.command('batch');
    registerBatchCommand(batch);
    registerCloneCommand(program);

    const commands = program.commands.map(c => c.name());
    expect(commands).toEqual(expect.arrayContaining(['batch', 'clone']));
    expect(batch.commands.map(c => c.name())).toEqual(expect.arrayContaining(['delete', 'tag']));
    expect(commands).not.toContain('tag');
  });

  it('registers remote and mcp subcommands on their groups', async () => {
    const { registerRemoteAdd } = await import('../../src/cli/commands/remote/add.js');
    const { registerRemoteList } = await import('../../src/cli/commands/remote/list.js');
    const { registerRemoteRemove } = await import('../../src/cli/commands/remote/remove.js');
    const { registerMcpSend } = await import('../../src/cli/commands/mcp/send.js');
    const { registerMcpInspect } = await import('../../src/cli/commands/mcp/inspect.js');

    const program = new Command();
    const remote = program.command('remote');
    const mcp = program.command('mcp');
    registerRemoteAdd(remote);
    registerRemoteList(remote);
    registerRemoteRemove(remote);
    registerMcpSend(mcp);
    registerMcpInspect(mcp);

    expect(program.commands.map(c => c.name())).toEqual(expect.arrayContaining(['remote', 'mcp']));
    expect(remote.commands.map(c => c.name())).toEqual(expect.arrayContaining(['add', 'list', 'remove']));
    expect(mcp.commands.map(c => c.name())).toEqual(expect.arrayContaining(['send', 'inspect']));
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
