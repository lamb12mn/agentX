import { createAsset, getAsset, listAssets, updateAsset, deleteAsset, readAssetContent } from '../store/assets.js';
import type { AssetMeta } from '../types.js';
import { getTemplate } from '../templates/index.js';
import { autoMatchBuiltin } from '../builtin-prompts/library.js';
import { renderTemplate } from '../orchestrator/template.js';

interface MatchedBuiltin {
  id: string;
  title: string;
  score: number;
}

type PromptWriteResult = AssetMeta & {
  matchedBuiltin?: MatchedBuiltin;
  appliedTemplate?: string;
};

function renderBuiltinTemplate(
  templateId: string,
  variables: Record<string, string> | undefined,
): string {
  const tmpl = getTemplate(templateId);
  if (!tmpl || tmpl.type !== 'prompt') {
    throw new Error(`Unknown prompt template: ${templateId}`);
  }
  return renderTemplate(tmpl.content, variables ?? {});
}

interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

/**
 * Prompt-related MCP tool definitions
 */
export interface PromptTools {
  list_prompts: ToolHandler<Record<string, never>, AssetMeta[]>;
  get_prompt: ToolHandler<{ id: string }, { meta: AssetMeta; content: string } | null>;
  create_prompt: ToolHandler<{ name: string; content?: string; templateId?: string; templateVars?: Record<string, string>; intent?: string; description?: string; tags?: string[] }, PromptWriteResult>;
  update_prompt: ToolHandler<{ id: string; name?: string; description?: string; tags?: string[]; content?: string; templateId?: string; templateVars?: Record<string, string>; optimizeIntent?: string }, PromptWriteResult>;
  delete_prompt: ToolHandler<{ id: string }, void>;
}

/**
 * Register prompt-related MCP tools (CRUD operations for prompts)
 * @param baseDir - Base directory for asset file storage
 * @returns Prompt tool handlers map
 */
export function registerPromptTools(baseDir: string): PromptTools {
  return {
    list_prompts: {
      description: 'List all prompts - Returns all prompt assets with their metadata',
      inputSchema: {
        type: 'object',
        properties: {},
        description: 'No parameters required. Returns all prompt assets.',
      },
      handler: async () => listAssets('prompt'),
    },

    get_prompt: {
      description: 'Get a prompt by id - Returns metadata and raw content',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique prompt ID (UUID format)',
          },
        },
        required: ['id'],
        description: 'Retrieves a specific prompt by its UUID, including raw content. Use list_prompts to find available prompt IDs.',
      },
      handler: async ({ id }) => {
        const meta = await getAsset(id);
        if (!meta) return null;
        const content = await readAssetContent(id);
        return { meta, content };
      },
    },

    create_prompt: {
      description: 'Create a new prompt - Creates and registers a new prompt asset',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Prompt name (required, max 100 chars, letters/numbers/underscores/hyphens)',
          },
          content: {
            type: 'string',
            description: 'Prompt content in text format (required unless templateId is provided)',
          },
          templateId: {
            type: 'string',
            description: 'Built-in prompt template id to use as the content when content is omitted',
          },
          templateVars: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Values for {{placeholders}} in a parameterised built-in template (used with templateId)',
          },
          intent: {
            type: 'string',
            description: 'Natural-language intent; when content/templateId are omitted, the best matching built-in prompt is applied automatically',
          },
          description: {
            type: 'string',
            description: 'Optional description (max 500 chars)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tags for categorization',
          },
        },
        required: ['name'],
        description: 'Creates a new prompt asset. Provide content, templateId, or intent for automatic built-in prompt matching.',
      },
      handler: async ({ name, content, templateId, templateVars, intent, description, tags }) => {
        let body = content ?? '';
        let matchedBuiltin: MatchedBuiltin | undefined;
        let appliedTemplate: string | undefined;

        if (!body && templateId) {
          body = renderBuiltinTemplate(templateId, templateVars);
          appliedTemplate = templateId;
        }
        if (!body && intent) {
          const matched = autoMatchBuiltin(intent);
          if (!matched) throw new Error(`No reliable built-in prompt match for "${intent}". Provide content explicitly, or use templateId / match_builtin_prompts.`);
          body = matched.text;
          matchedBuiltin = { id: matched.id, title: matched.title, score: matched.score };
        }
        if (!body) throw new Error('content, templateId or intent is required');

        const meta = await createAsset({ type: 'prompt', name, description, tags: tags ?? [] }, body, baseDir);
        return {
          ...meta,
          ...(matchedBuiltin ? { matchedBuiltin } : {}),
          ...(appliedTemplate ? { appliedTemplate } : {}),
        };
      },
    },

    update_prompt: {
      description: 'Update a prompt - Updates prompt metadata and/or content',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique prompt ID to update (required)',
          },
          name: {
            type: 'string',
            description: 'New prompt name (optional)',
          },
          description: {
            type: 'string',
            description: 'New description (optional)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'New tags array (optional, replaces existing)',
          },
          content: {
            type: 'string',
            description: 'New prompt content (optional)',
          },
          templateId: {
            type: 'string',
            description: 'Rebuild the prompt from a parameterised built-in template (use with templateVars)',
          },
          templateVars: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Values for {{placeholders}} in the built-in template',
          },
          optimizeIntent: {
            type: 'string',
            description: 'Legacy: automatically match a built-in prompt and append it as a read-only reference block',
          },
        },
        required: ['id'],
        description: 'Updates an existing prompt. Use templateId + templateVars to restructure content, or content to replace it directly.',
      },
      handler: async ({ id, name, description, tags, content, templateId, templateVars, optimizeIntent }) => {
        let body = content;
        let matchedBuiltin: MatchedBuiltin | undefined;
        let appliedTemplate: string | undefined;

        if (body === undefined && templateId) {
          body = renderBuiltinTemplate(templateId, templateVars);
          appliedTemplate = templateId;
        } else if (optimizeIntent) {
          const matched = autoMatchBuiltin(optimizeIntent);
          if (!matched) throw new Error(`No reliable built-in prompt match for "${optimizeIntent}". Provide content explicitly, or use match_builtin_prompts.`);
          const current = body ?? (await readAssetContent(id)) ?? '';
          body = [current.trim(), matched.reference].filter(Boolean).join('\n\n');
          matchedBuiltin = { id: matched.id, title: matched.title, score: matched.score };
        }

        const meta = await updateAsset(id, { name, description, tags, content: body });
        return {
          ...meta,
          ...(matchedBuiltin ? { matchedBuiltin } : {}),
          ...(appliedTemplate ? { appliedTemplate } : {}),
        };
      },
    },

    delete_prompt: {
      description: 'Delete a prompt - Permanently removes a prompt from the database',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique prompt ID to delete (required, this action cannot be undone)',
          },
        },
        required: ['id'],
        description: 'Permanently deletes a prompt. This action cannot be undone - use with caution.',
      },
      handler: async ({ id }) => deleteAsset(id),
    },
  };
}
