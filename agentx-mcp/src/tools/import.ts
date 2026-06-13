import { readFile, readdir, stat } from 'fs/promises';
import { join, basename, extname } from 'path';
import { homedir } from 'os';
import { createAsset, listAssets } from '../store/assets.js';
import { logAudit } from '../audit/index.js';
import type { AssetMeta, AssetType, ImportResult } from '../types.js';

export type { ImportResult };

/**
 * Handler interface for MCP tool registration
 * @template TInput - The input parameter type
 * @template TOutput - The return type
 */
interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

/**
 * Import-related MCP tool definitions
 */
export interface ImportTools {
  import_from_claude: ToolHandler<
    { type: AssetType; source_dir?: string; tags?: string[] },
    ImportResult
  >;
}

/**
 * Register import-related MCP tools (import from Claude Code directories)
 * @param baseDir - Base directory for asset file storage
 * @returns Import tool handlers map
 */
export function registerImportTools(baseDir: string): ImportTools {
  return {
    import_from_claude: {
      description:
        'Import skills, rules, or prompts from Claude Code local directories (~/.claude/skills, ~/.claude/prompts) into AgentX',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['skill', 'prompt', 'rule'],
            description: 'Asset type to import',
          },
          source_dir: {
            type: 'string',
            description: 'Optional: override source directory path',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to apply to all imported assets',
          },
        },
        required: ['type'],
      },
      handler: async ({ type, source_dir, tags }) => {
        const result: ImportResult = { imported: [], skipped: [], errors: [] };

        // Determine source directory
        let srcDir: string;
        if (source_dir) {
          srcDir = source_dir;
        } else if (type === 'skill') {
          srcDir = join(homedir(), '.claude', 'skills');
        } else if (type === 'prompt') {
          srcDir = join(homedir(), '.claude', 'prompts');
        } else {
          // rule: look for CLAUDE.md in current dir
          srcDir = process.cwd();
        }

        // Check directory exists
        try {
          await stat(srcDir);
        } catch {
          result.errors.push(`Source directory not found: ${srcDir}`);
          return result;
        }

        // Read files
        let files: string[];
        try {
          const entries = await readdir(srcDir, { withFileTypes: true });
          files = entries
            .filter(
              (e) =>
                e.isFile() &&
                (extname(e.name) === '.md' || e.name === 'CLAUDE.md')
            )
            .map((e) => join(srcDir, e.name));
        } catch (err) {
          result.errors.push(`Failed to read directory: ${String(err)}`);
          return result;
        }

        // Build set of existing names for deduplication
        const existing = await listAssets(type);
        const existingNames = new Set(existing.map((a) => a.name));

        // Import each file
        for (const filePath of files) {
          const name = basename(filePath, extname(filePath));
          if (existingNames.has(name)) {
            result.skipped.push(name);
            continue;
          }
          try {
            const content = await readFile(filePath, 'utf-8');
            const meta = await createAsset(
              { type, name, tags: tags ?? ['imported', 'claude'] },
              content,
              baseDir
            );
            result.imported.push(meta);
          } catch (err) {
            result.errors.push(`Failed to import ${filePath}: ${String(err)}`);
          }
        }

        logAudit({
          timestamp: new Date().toISOString(),
          action: 'IMPORT_ASSET',
          userId: 'system',
          details: { type, count: result.imported.length, skipped: result.skipped.length },
        });

        return result;
      },
    },
  };
}
