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

const program = new Command();
program
  .name('agentx')
  .description('AgentX CLI — manage your local agent asset library')
  .version('1.0.0');

registerListCommand(program);
registerSearchCommand(program);
registerInfoCommand(program);
registerGetCommand(program);
registerDeleteCommand(program);
registerBatchCommand(program);
registerCloneCommand(program);
registerExportCommand(program);
registerImportCommand(program);
registerCreateCommand(program);
registerTemplateCommand(program);
registerValidateCommand(program);

program.parse();
