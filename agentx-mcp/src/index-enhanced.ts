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

// Import enhanced modules
import { PluginLoader } from './plugins/plugin-loader.js';
import { CloudSyncService } from './sync/cloud-sync.js';
import { AIAssistant } from './ai/assistant.js';
import { RESTAPI } from './api/rest-api.js';
import { MonitoringDashboard } from './monitoring/dashboard.js';
import { MobileResponsiveUI } from './ui/mobile-responsive.js';
import { VisualWorkflowEditor } from './editor/visual-workflow-editor.js';
import { getCacheStats, clearAssetCache } from './store/cache.js';
import { getSystemStats } from './store/assets-enhanced.js';

type AnyHandler = {
  description: string;
  inputSchema?: Record<string, unknown>;
  handler: (input: never) => Promise<unknown>;
};

const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
const dbPath = join(baseDir, 'agentx.db');

initDb(dbPath);

// Initialize enhanced modules
const pluginLoader = new PluginLoader(join(baseDir, 'plugins'));
const cloudSync = new CloudSyncService();
const aiAssistant = new AIAssistant({ enabled: true, autoSuggest: true });
const restApi = new RESTAPI({ port: 3000, host: 'localhost', cors: true });
const monitoringDashboard = new MonitoringDashboard({ 
  refreshInterval: 5000,
  enableCharts: true,
  enableRealTime: true 
});
const mobileUI = new MobileResponsiveUI({
  breakpoints: { mobile: 480, tablet: 768, desktop: 1024 },
  enableTouch: true,
  adaptiveLayout: true,
});
const visualEditor = new VisualWorkflowEditor();

// Register all tools
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

// Enhanced tools
const enhancedTools: Record<string, AnyHandler> = {
  // Performance optimization tools
  'cache.getStats': {
    description: 'Get cache performance statistics',
    inputSchema: { type: 'object' },
    handler: async () => getCacheStats(),
  },
  'cache.clear': {
    description: 'Clear all caches',
    inputSchema: { type: 'object' },
    handler: async () => {
      clearAssetCache();
      return { success: true, message: 'Cache cleared' };
    },
  },
  'system.stats': {
    description: 'Get system statistics',
    inputSchema: { type: 'object' },
    handler: async () => getSystemStats(),
  },

  // Plugin system tools
  'plugins.load': {
    description: 'Load all plugins',
    inputSchema: { type: 'object' },
    handler: async () => {
      await pluginLoader.loadAll();
      return { success: true, count: pluginLoader.getAllPlugins().length };
    },
  },
  'plugins.list': {
    description: 'List all loaded plugins',
    inputSchema: { type: 'object' },
    handler: async () => pluginLoader.getAllPlugins(),
  },
  'plugins.enable': {
    description: 'Enable a plugin',
    inputSchema: { 
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
    handler: async ({ name }: { name: string }) => {
      return { success: pluginLoader.enablePlugin(name) };
    },
  },
  'plugins.disable': {
    description: 'Disable a plugin',
    inputSchema: { 
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    },
    handler: async ({ name }: { name: string }) => {
      return { success: pluginLoader.disablePlugin(name) };
    },
  },

  // Cloud sync tools
  'sync.configure': {
    description: 'Configure cloud sync',
    inputSchema: { 
      type: 'object',
      properties: {
        endpoint: { type: 'string' },
        apiKey: { type: 'string' },
        syncInterval: { type: 'number' },
        autoSync: { type: 'boolean' },
      },
      required: ['endpoint', 'apiKey'],
    },
    handler: async (config: any) => {
      cloudSync.configure(config);
      return { success: true };
    },
  },
  'sync.start': {
    description: 'Start auto sync',
    inputSchema: { type: 'object' },
    handler: async () => {
      cloudSync.startAutoSync();
      return { success: true };
    },
  },
  'sync.stop': {
    description: 'Stop auto sync',
    inputSchema: { type: 'object' },
    handler: async () => {
      cloudSync.stopAutoSync();
      return { success: true };
    },
  },
  'sync.status': {
    description: 'Get sync status',
    inputSchema: { type: 'object' },
    handler: async () => cloudSync.getStatus(),
  },
  'sync.force': {
    description: 'Force sync now',
    inputSchema: { type: 'object' },
    handler: async () => cloudSync.forceSync(),
  },

  // AI Assistant tools
  'ai.suggestions': {
    description: 'Generate AI suggestions',
    inputSchema: { type: 'object' },
    handler: async () => aiAssistant.generateSuggestions(),
  },
  'ai.enable': {
    description: 'Enable AI assistant',
    inputSchema: { type: 'object' },
    handler: async () => {
      aiAssistant.enable();
      return { success: true };
    },
  },
  'ai.disable': {
    description: 'Disable AI assistant',
    inputSchema: { type: 'object' },
    handler: async () => {
      aiAssistant.disable();
      return { success: true };
    },
  },
  'ai.completion': {
    description: 'Get completion suggestions',
    inputSchema: { 
      type: 'object',
      properties: {
        input: { type: 'string' },
        context: { type: 'object' },
      },
      required: ['input'],
    },
    handler: async ({ input, context }: { input: string; context: any }) => {
      return aiAssistant.getCompletionSuggestions(input, context);
    },
  },

  // REST API tools
  'api.start': {
    description: 'Start REST API server',
    inputSchema: { type: 'object' },
    handler: async () => {
      await restApi.start();
      return { success: true };
    },
  },
  'api.stop': {
    description: 'Stop REST API server',
    inputSchema: { type: 'object' },
    handler: async () => {
      await restApi.stop();
      return { success: true };
    },
  },
  'api.stats': {
    description: 'Get API statistics',
    inputSchema: { type: 'object' },
    handler: async () => restApi.getStats(),
  },

  // Monitoring tools
  'monitor.start': {
    description: 'Start monitoring dashboard',
    inputSchema: { type: 'object' },
    handler: async () => {
      monitoringDashboard.start();
      return { success: true };
    },
  },
  'monitor.stop': {
    description: 'Stop monitoring dashboard',
    inputSchema: { type: 'object' },
    handler: async () => {
      monitoringDashboard.stop();
      return { success: true };
    },
  },
  'monitor.metrics': {
    description: 'Get current metrics',
    inputSchema: { type: 'object' },
    handler: async () => monitoringDashboard.getMetrics(),
  },
  'monitor.report': {
    description: 'Generate HTML report',
    inputSchema: { type: 'object' },
    handler: async () => monitoringDashboard.generateHTMLReport(),
  },

  // Visual editor tools
  'editor.create': {
    description: 'Create visual workflow from definition',
    inputSchema: { 
      type: 'object',
      properties: {
        workflow: { type: 'object' },
      },
      required: ['workflow'],
    },
    handler: async ({ workflow }: { workflow: any }) => {
      visualEditor.createFromWorkflow(workflow);
      return { 
        success: true,
        nodes: visualEditor.getNodes(),
        connections: visualEditor.getConnections(),
      };
    },
  },
  'editor.nodes': {
    description: 'Get all nodes',
    inputSchema: { type: 'object' },
    handler: async () => visualEditor.getNodes(),
  },
  'editor.connections': {
    description: 'Get all connections',
    inputSchema: { type: 'object' },
    handler: async () => visualEditor.getConnections(),
  },
  'editor.export': {
    description: 'Export workflow definition',
    inputSchema: { type: 'object' },
    handler: async () => visualEditor.exportToWorkflow(),
  },
  'editor.svg': {
    description: 'Export as SVG',
    inputSchema: { type: 'object' },
    handler: async () => visualEditor.exportToSVG(),
  },
  'editor.autolayout': {
    description: 'Apply automatic layout',
    inputSchema: { type: 'object' },
    handler: async () => {
      visualEditor.autoLayout();
      return { success: true };
    },
  },

  // Mobile UI tools
  'ui.mobile.components': {
    description: 'Get all mobile components',
    inputSchema: { type: 'object' },
    handler: async () => mobileUI.getAllComponents(),
  },
  'ui.mobile.breakpoint': {
    description: 'Get current breakpoint',
    inputSchema: { type: 'object' },
    handler: async () => mobileUI.getCurrentBreakpoint(),
  },
  'ui.mobile.css': {
    description: 'Generate responsive CSS',
    inputSchema: { type: 'object' },
    handler: async () => mobileUI.generateCSS(),
  },
};

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
  ...enhancedTools,
};

const server = new Server(
  { name: 'agentx', version: '2.0.0' },
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

// Initialize enhanced modules
async function initializeEnhancedModules(): Promise<void> {
  console.log('Initializing enhanced modules...');
  
  // Load plugins
  try {
    await pluginLoader.loadAll();
    console.log(`Loaded ${pluginLoader.getAllPlugins().length} plugins`);
  } catch (error) {
    console.warn('Failed to load plugins:', error);
  }

  // Start monitoring
  monitoringDashboard.start();
  console.log('Monitoring dashboard started');

  // Setup event listeners
  setupEventListeners();
}

function setupEventListeners(): void {
  // Update monitoring metrics when assets change
  pluginLoader.on('pluginLoaded', (name) => {
    monitoringDashboard.addRealTimeEvent({
      type: 'plugin_loaded',
      data: { name },
      timestamp: Date.now(),
    });
  });

  aiAssistant.on('suggestionsGenerated', (suggestions) => {
    monitoringDashboard.addRealTimeEvent({
      type: 'ai_suggestions',
      data: { count: suggestions.length },
      timestamp: Date.now(),
    });
  });

  cloudSync.on('syncComplete', (result) => {
    monitoringDashboard.addRealTimeEvent({
      type: 'sync_complete',
      data: result,
      timestamp: Date.now(),
    });
  });
}

async function main(): Promise<void> {
  console.log('Starting AgentX MCP Server v2.0...');
  
  // Initialize enhanced modules
  await initializeEnhancedModules();
  
  // Start REST API
  try {
    await restApi.start();
    console.log('REST API server started on port 3000');
  } catch (error) {
    console.warn('Failed to start REST API:', error);
  }
  
  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.log('AgentX MCP Server v2.0 is running!');
  console.log(`Base directory: ${baseDir}`);
  console.log(`Total tools available: ${Object.keys(allTools).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
