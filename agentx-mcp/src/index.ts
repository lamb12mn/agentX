#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from './store/db.js';
import { registerSkillTools } from './tools/skills.js';
import { registerAgentTools } from './tools/agents.js';
import { registerPromptTools } from './tools/prompts.js';
import { registerRuleTools } from './tools/rules.js';
import { registerMcpTools } from './tools/mcps.js';
import { registerSearchTools } from './tools/search.js';
import { registerWorkflowTools } from './tools/workflows.js';
import { registerImportTools } from './tools/import.js';
import { registerBatchTools } from './tools/batch.js';
import { registerCloneTools } from './tools/clone.js';
import { registerVersionTools } from './tools/versions.js';
import { registerExportTools } from './tools/export.js';
import { registerDependencyTools } from './tools/dependencies.js';
import { formatError, ErrorCode } from './utils/errors.js';

type AnyHandler = {
  description: string;
  inputSchema?: Record<string, unknown>;
  handler: (input: never) => Promise<unknown>;
};

const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
const dbPath = join(baseDir, 'agentx.db');

initDb(dbPath);

const skillTools = registerSkillTools(baseDir);
const agentTools = registerAgentTools(baseDir);
const promptTools = registerPromptTools(baseDir);
const ruleTools = registerRuleTools(baseDir);
const mcpTools = registerMcpTools(baseDir);
const searchTools = registerSearchTools();
const workflowTools = registerWorkflowTools(baseDir);
const importTools = registerImportTools(baseDir);
const batchTools = registerBatchTools(baseDir);
const cloneTools = registerCloneTools(baseDir);
const versionTools = registerVersionTools();
const exportTools = registerExportTools(baseDir);
const dependencyTools = registerDependencyTools();

const allTools: Record<string, AnyHandler> = {
  ...(skillTools as unknown as Record<string, AnyHandler>),
  ...(agentTools as unknown as Record<string, AnyHandler>),
  ...(promptTools as unknown as Record<string, AnyHandler>),
  ...(ruleTools as unknown as Record<string, AnyHandler>),
  ...(mcpTools as unknown as Record<string, AnyHandler>),
  ...(searchTools as unknown as Record<string, AnyHandler>),
  ...(workflowTools as unknown as Record<string, AnyHandler>),
  ...(importTools as unknown as Record<string, AnyHandler>),
  ...(batchTools as unknown as Record<string, AnyHandler>),
  ...(cloneTools as unknown as Record<string, AnyHandler>),
  ...(versionTools as unknown as Record<string, AnyHandler>),
  ...(exportTools as unknown as Record<string, AnyHandler>),
  ...(dependencyTools as unknown as Record<string, AnyHandler>),
};

const server = new Server(
  { name: 'agentx', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema ?? { type: 'object' as const },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = allTools[name];
  if (!tool) {
    const availableTools = Object.keys(allTools).join(', ');
    return {
      content: [{
        type: 'text' as const,
        text: formatError(`Unknown tool: ${name}`, {
          code: ErrorCode.INVALID_INPUT,
          tool: name,
          suggestion: `Available tools: ${availableTools}`,
        }),
      }],
      isError: true,
    };
  }
  try {
    const result = await tool.handler(args as never);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{
        type: 'text' as const,
        text: formatError(err instanceof Error ? err : message, {
          code: ErrorCode.ASSET_CREATE_FAILED,
          tool: name,
          suggestion: 'Check the input parameters and try again',
        }),
      }],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
