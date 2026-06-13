#!/usr/bin/env node
import { Command } from 'commander';
import { registerListCommand } from './cli/commands/list.js';
import { registerSearchCommand } from './cli/commands/search.js';
import { registerInfoCommand } from './cli/commands/info.js';
import { registerGetCommand } from './cli/commands/get.js';
import { registerDeleteCommand } from './cli/commands/delete.js';
import { registerExportCommand } from './cli/commands/export.js';
import { registerImportCommand } from './cli/commands/import.js';
import { registerCreateCommand } from './cli/commands/create.js';
import { registerTemplateCommand } from './cli/commands/templates.js';
import { registerValidateCommand } from './cli/commands/validate.js';
import { registerBatchCommand } from './cli/commands/batch.js';
import { registerCloneCommand } from './cli/commands/clone.js';
import { registerDoctorCommand } from "./cli/commands/doctor.js";
import { registerGraphCommand } from "./cli/commands/graph.js";
import { registerProxyCommand } from "./cli/commands/proxy.js";
import { registerInitCommand } from "./cli/commands/init.js";
import { registerAuditCommand } from "./cli/commands/audit.js";
import { registerBackupCommand } from "./cli/commands/backup.js";
import { registerPush } from "./cli/commands/remote/push.js";
import { registerMcpInspect } from "./cli/commands/mcp/inspect.js";
import { registerMcpSend } from "./cli/commands/mcp/send.js";
import { registerPull } from "./cli/commands/remote/pull.js";
import { registerRemoteRemove } from "./cli/commands/remote/remove.js";
import { registerRemoteList } from "./cli/commands/remote/list.js";
import { registerRemoteAdd } from "./cli/commands/remote/add.js";
import { registerRestoreCommand } from "./cli/commands/restore.js";
import { registerVaultCommand } from "./cli/commands/vault.js";
import { registerTeamCommand } from "./cli/commands/team.js";

const program = new Command();

program
  .name('agentx')
  .description('AgentX CLI — manage your local agent asset library')
  .version('1.0.0')
  .configureHelp({
    sortSubcommands: true,
  });

// Diagnostic & utility commands
registerDoctorCommand(program);
registerGraphCommand(program);
registerProxyCommand(program);
registerInitCommand(program);
registerAuditCommand(program);
registerBackupCommand(program);
registerRestoreCommand(program);

// Remote sync commands
const remote = program.command('remote').description('Remote management commands');
registerRemoteAdd(remote);
registerRemoteList(remote);
registerRemoteRemove(remote);
registerPull(remote);
registerPush(remote);

// MCP tool commands
const mcp = program.command('mcp').description('MCP server commands');
registerMcpSend(mcp);
registerMcpInspect(mcp);

// Batch operations
const batch = program.command('batch').description('Batch operations');
registerBatchCommand(batch);

// Asset management commands
registerListCommand(program);
registerSearchCommand(program);
registerInfoCommand(program);
registerGetCommand(program);
registerDeleteCommand(program);
registerCloneCommand(program);
registerExportCommand(program);
registerImportCommand(program);
registerCreateCommand(program);
registerTemplateCommand(program);
registerValidateCommand(program);

// Vault commands
registerVaultCommand(program);

// Team orchestration commands
registerTeamCommand(program);

// Web dashboard
program
  .command('web')
  .description('Start web dashboard')
  .action(() => {
    import('./web/server.js').catch(err => {
      console.error('Failed to start web server:', err);
      process.exit(1);
    });
  });

program.parse();