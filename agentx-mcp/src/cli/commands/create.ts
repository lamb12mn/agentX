import type { Command } from 'commander';
import { createAsset } from '../../store/assets.js';
import type { AssetType } from '../../types.js';
import chalk from 'chalk';
import { input, editor, confirm } from '@inquirer/prompts';
import { getBaseDir, withDb } from '../common.js';
import { getTemplate } from '../../templates/index.js';

const VALID_TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'];

interface CreateOptions {
  type: string;
  name?: string;
  content?: string;
  description?: string;
  tags?: string;
  template?: string;
  interactive?: boolean;
}

/**
 * Register the `create` command — create a new asset with interactive or CLI options
 */
export function registerCreateCommand(program: Command): void {
  program
    .command('create')
    .description('Create a new asset (skill|prompt|rule|mcp|workflow|agent)')
    .option('-t, --type <type>', `Asset type: ${VALID_TYPES.join('|')}`, 'skill')
    .option('-n, --name <name>', 'Asset name')
    .option('-c, --content <content>', 'Asset content (or @file to read from file)')
    .option('-d, --description <desc>', 'Asset description')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('-T, --template <id>', 'Built-in template id to use as the initial content')
    .option('-i, --interactive', 'Interactive mode (prompt for all values)')
    .action(withDb(async (options: CreateOptions) => {
      const baseDir = getBaseDir();

      const { name, content, description, tags, template, interactive } = options;
      let { type } = options;

      // Validate type
      if (!VALID_TYPES.includes(type as AssetType)) {
        console.error(chalk.red(`Invalid type: ${type}. Valid: ${VALID_TYPES.join(', ')}`));
        process.exit(1);
      }

      let finalName = name ?? '';
      let finalContent = content ?? '';
      let finalDesc = description ?? '';
      let finalTags: string[] = [];

      if (template && !content) {
        const tmpl = getTemplate(template);
        if (!tmpl) {
          console.error(chalk.red(`Unknown template: ${template}`));
          process.exit(1);
        }
        if (tmpl.type !== type) {
          console.error(chalk.red(`Template "${template}" is for ${tmpl.type}, not ${type}`));
          process.exit(1);
        }
        finalContent = tmpl.content;
        finalDesc = finalDesc || tmpl.description;
        finalTags = [...tmpl.tags];
      }

      // Interactive mode
      if (interactive || !name || !finalContent) {
        const useInteractive = await confirm({ 
          message: 'Use interactive mode?', 
          default: true 
        });

        if (useInteractive) {
          const answer = await input({
            message: 'Select asset type:',
            default: type,
          });
          type = answer as AssetType;
          finalName = await input({
            message: 'Enter asset name:',
            default: finalName,
            validate: (val: string) => val.length > 0 || 'Name is required',
          });
          finalContent = await editor({
            message: 'Enter asset content (will open editor):',
            default: finalContent,
          });
          finalDesc = await input({
            message: 'Enter description (optional):',
            default: finalDesc,
          });
          const tagInput = await input({
            message: 'Enter tags (comma-separated, optional):',
            default: finalTags.join(', '),
          });
          finalTags = tagInput.split(',').map((t: string) => t.trim()).filter(Boolean);
        }
      }

      // Validate required params in non-interactive mode
      if (!finalName) {
        console.error(chalk.red('Error: --name is required (or use --interactive)'));
        process.exit(1);
      }
      if (!finalContent) {
        console.error(chalk.red('Error: --content is required (or use --interactive)'));
        process.exit(1);
      }

      // Handle @file syntax
      if (finalContent.startsWith('@')) {
        const fs = await import('fs/promises');
        const filePath = finalContent.slice(1);
        try {
          finalContent = await fs.readFile(filePath, 'utf-8');
        } catch {
          console.error(chalk.red(`Cannot read file: ${filePath}`));
          process.exit(1);
        }
      }

      // Parse tags
      if (tags) {
        finalTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      }

      // Create asset based on type
      try {
        const assetContent = finalContent;

        // For mcp/agent types, validate YAML
        if ((type === 'mcp' || type === 'agent' || type === 'workflow') && finalContent) {
          try {
            // If content looks like YAML, use it as-is
            if (!finalContent.includes(':')) {
              // Try as JSON
              JSON.parse(finalContent);
            }
          } catch {
            console.error(chalk.yellow('Warning: Content may not be valid YAML/JSON'));
          }
        }

        const result = await createAsset(
          { 
            type: type as AssetType, 
            name: finalName, 
            description: finalDesc || undefined, 
            tags: finalTags 
          },
          assetContent,
          baseDir
        );

        console.log(chalk.green(`✓ Created ${type}:`), chalk.bold(result.name));
        console.log(chalk.dim(`  ID: ${result.id}`));
        console.log(chalk.dim(`  File: ${result.file_path}`));
      } catch (err) {
        console.error(chalk.red('Failed to create asset:'), err instanceof Error ? err.message : err);
        process.exit(1);
      }
    }));
}