import type { Command } from 'commander';
import { listTemplates, getTemplate, getTemplatesByType } from '../../templates/index.js';
import { formatTable } from '../format.js';
import chalk from 'chalk';
import type { AssetType } from '../../types.js';

export function registerTemplateCommand(program: Command): void {
  program
    .command('templates [type]')
    .description('List available templates. Type: skill|agent|mcp|prompt|rule|workflow')
    .action(async (type?: string) => {
      let templates;

      if (type) {
        if (!['skill', 'agent', 'mcp', 'prompt', 'rule', 'workflow'].includes(type)) {
          console.error(chalk.red(`Invalid type: ${type}`));
          process.exit(1);
        }
        templates = getTemplatesByType(type as AssetType);
      } else {
        templates = listTemplates();
      }

      console.log(chalk.cyan('Available Templates:'));
      console.log(chalk.dim(`Found ${templates.length} template(s)\n`));

      for (const t of templates) {
        console.log(chalk.bold(`${t.id}`));
        console.log(`  ${chalk.green(t.name)} - ${t.description}`);
        console.log(chalk.dim(`  Tags: ${t.tags.join(', ')}\n`));
      }
    });
}