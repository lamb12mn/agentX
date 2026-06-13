import { EventEmitter } from 'events';
import type { AssetMeta, AssetType } from '../types.js';

/**
 * AI recommendation for asset management
 */
export interface AIRecommendation {
  type: 'asset' | 'workflow' | 'optimization';
  title: string;
  description: string;
  confidence: number;
  data: any;
  actions: RecommendedAction[];
}

/**
 * Recommended action that can be executed
 */
export interface RecommendedAction {
  type: 'create' | 'update' | 'delete' | 'link';
  target: string;
  description: string;
  execute: () => Promise<void>;
}

/**
 * Parameters for executing an agent via AIAssistant
 */
export interface AgentExecutionParams {
  /** The agent's role name */
  role: string;
  /** Reference to the agent asset */
  agent_ref: string;
  /** Optional system prompt override */
  system_prompt?: string;
}

/**
 * Configuration for the AI assistant
 */
export interface AssistantConfig {
  enabled: boolean;
  autoSuggest: boolean;
  suggestionInterval: number;
  maxSuggestions: number;
}

/**
 * Context data used by the AI assistant for generating suggestions
 */
export interface AssistantContext {
  recentActivity: AssetMeta[];
  assetTypes: Record<AssetType, number>;
  workflowComplexity: number;
  userPreferences: UserPreferences;
}

/**
 * User preferences for AI suggestions
 */
export interface UserPreferences {
  preferredAssetTypes: AssetType[];
  complexityLevel: 'beginner' | 'intermediate' | 'advanced';
  notificationFrequency: 'low' | 'medium' | 'high';
}

/**
 * AI Assistant that provides intelligent suggestions for asset management
 * Extends EventEmitter for event-driven suggestion notifications
 */
export class AIAssistant extends EventEmitter {
  private config: AssistantConfig;
  private context: AssistantContext | null = null;
  private suggestionTimer: NodeJS.Timeout | null = null;
  private history: AIRecommendation[] = [];

  constructor(config: Partial<AssistantConfig> = {}) {
    super();
    this.config = {
      enabled: true,
      autoSuggest: true,
      suggestionInterval: 1000 * 60 * 5, // 5 minutes
      maxSuggestions: 10,
      ...config,
    };
  }

  /**
   * 更新上下文
   */
  updateContext(context: Partial<AssistantContext>): void {
    this.context = {
      ...this.context,
      ...context,
    } as AssistantContext;
    this.emit('contextUpdated', this.context);
  }

  /**
   * 生成建议
   */
  async generateSuggestions(): Promise<AIRecommendation[]> {
    if (!this.context) {
      throw new Error('Assistant context not initialized');
    }

    const suggestions: AIRecommendation[] = [];

    // 基于用户活动生成建议
    suggestions.push(...this.generateAssetSuggestions());
    suggestions.push(...this.generateWorkflowSuggestions());
    suggestions.push(...this.generateOptimizationSuggestions());

    // 按置信度排序
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // 限制数量
    const limitedSuggestions = suggestions.slice(0, this.config.maxSuggestions);

    // 添加到历史记录
    this.history.push(...limitedSuggestions);

    this.emit('suggestionsGenerated', limitedSuggestions);
    return limitedSuggestions;
  }

  /**
   * 生成资产相关建议
   */
  private generateAssetSuggestions(): AIRecommendation[] {
    const suggestions: AIRecommendation[] = [];
    const { recentActivity, assetTypes } = this.context!;

    // 检查是否需要创建特定类型的资产
    if (assetTypes.skill < 3 && recentActivity.length > 5) {
      suggestions.push({
        type: 'asset',
        title: '创建新技能',
        description: '您最近活动频繁，建议创建一个新的技能来扩展功能',
        confidence: 0.8,
        data: { assetType: 'skill' },
        actions: [
          {
            type: 'create',
            target: 'skill',
            description: '创建新技能',
            execute: async () => {
              this.emit('actionRequested', { type: 'create', target: 'skill' });
            },
          },
        ],
      });
    }

    // 检查是否需要创建提示词
    if (assetTypes.prompt === 0) {
      suggestions.push({
        type: 'asset',
        title: '创建提示词',
        description: '您还没有创建任何提示词，创建一个可以提高工作效率',
        confidence: 0.9,
        data: { assetType: 'prompt' },
        actions: [
          {
            type: 'create',
            target: 'prompt',
            description: '创建提示词',
            execute: async () => {
              this.emit('actionRequested', { type: 'create', target: 'prompt' });
            },
          },
        ],
      });
    }

    return suggestions;
  }

  /**
   * 生成工作流相关建议
   */
  private generateWorkflowSuggestions(): AIRecommendation[] {
    const suggestions: AIRecommendation[] = [];
    const { workflowComplexity, recentActivity } = this.context!;

    // 如果工作流复杂度高，建议优化
    if (workflowComplexity > 0.7) {
      suggestions.push({
        type: 'workflow',
        title: '优化工作流',
        description: '检测到工作流复杂度较高，建议进行优化以提高性能',
        confidence: 0.85,
        data: { optimizationType: 'performance' },
        actions: [
          {
            type: 'update',
            target: 'workflow',
            description: '优化工作流',
            execute: async () => {
              this.emit('actionRequested', { type: 'optimize', target: 'workflow' });
            },
          },
        ],
      });
    }

    // 如果最近有很多相似活动，建议自动化
    if (recentActivity.length > 10) {
      suggestions.push({
        type: 'workflow',
        title: '自动化重复任务',
        description: '检测到重复的任务模式，建议创建自动化工作流',
        confidence: 0.75,
        data: { automationType: 'repetitive' },
        actions: [
          {
            type: 'create',
            target: 'workflow',
            description: '创建自动化工作流',
            execute: async () => {
              this.emit('actionRequested', { type: 'create', target: 'workflow' });
            },
          },
        ],
      });
    }

    return suggestions;
  }

  /**
   * 生成优化相关建议
   */
  private generateOptimizationSuggestions(): AIRecommendation[] {
    const suggestions: AIRecommendation[] = [];
    const { assetTypes } = this.context!;

    // 建议清理未使用的资产
    const totalAssets = Object.values(assetTypes).reduce((sum, count) => sum + count, 0);
    if (totalAssets > 50) {
      suggestions.push({
        type: 'optimization',
        title: '清理未使用的资产',
        description: '资产数量较多，建议定期清理未使用的资产以保持系统整洁',
        confidence: 0.7,
        data: { cleanupType: 'unused' },
        actions: [
          {
            type: 'delete',
            target: 'unused_assets',
            description: '清理未使用的资产',
            execute: async () => {
              this.emit('actionRequested', { type: 'cleanup', target: 'unused' });
            },
          },
        ],
      });
    }

    // 建议创建依赖关系
    if (assetTypes.skill > 5 && assetTypes.workflow < 2) {
      suggestions.push({
        type: 'optimization',
        title: '建立技能依赖关系',
        description: '建议为相关技能建立依赖关系，提高可管理性',
        confidence: 0.65,
        data: { linkType: 'dependencies' },
        actions: [
          {
            type: 'link',
            target: 'skills',
            description: '建立依赖关系',
            execute: async () => {
              this.emit('actionRequested', { type: 'link', target: 'skills' });
            },
          },
        ],
      });
    }

    return suggestions;
  }

  /**
   * 获取智能补全建议
   */
  async getCompletionSuggestions(input: string, context: any): Promise<string[]> {
    // 基于输入和上下文生成补全建议
    const suggestions: string[] = [];

    // 简单的基于规则的补全
    if (input.startsWith('/')) {
      suggestions.push('/create', '/list', '/search', '/help', '/settings');
    }

    // 基于上下文的补全
    if (context.assetType) {
      suggestions.push(`创建新的${context.assetType}`);
      suggestions.push(`列出所有${context.assetType}`);
    }

    return suggestions;
  }

  /**
   * 获取智能搜索建议
   */
  async getSearchSuggestions(query: string): Promise<string[]> {
    const suggestions: string[] = [];

    // 基于查询生成搜索建议
    if (query.length > 2) {
      suggestions.push(`${query} 相关技能`);
      suggestions.push(`${query} 提示词`);
      suggestions.push(`${query} 工作流`);
    }

    return suggestions;
  }

  /**
   * 启动自动建议
   */
  startAutoSuggest(): void {
    if (!this.config.autoSuggest) return;

    if (this.suggestionTimer) {
      clearInterval(this.suggestionTimer);
    }

    this.suggestionTimer = setInterval(() => {
      this.generateSuggestions().catch(error => {
        this.emit('error', error);
      });
    }, this.config.suggestionInterval);

    this.emit('autoSuggestStarted');
  }

  /**
   * 停止自动建议
   */
  stopAutoSuggest(): void {
    if (this.suggestionTimer) {
      clearInterval(this.suggestionTimer);
      this.suggestionTimer = null;
    }
    this.emit('autoSuggestStopped');
  }

  /**
   * 启用助手
   */
  enable(): void {
    this.config.enabled = true;
    if (this.config.autoSuggest) {
      this.startAutoSuggest();
    }
    this.emit('enabled');
  }

  /**
   * 禁用助手
   */
  disable(): void {
    this.config.enabled = false;
    this.stopAutoSuggest();
    this.emit('disabled');
  }

  /**
   * 获取建议历史
   */
  getHistory(): AIRecommendation[] {
    return [...this.history];
  }

  /**
   * 清除历史
   */
  clearHistory(): void {
    this.history = [];
    this.emit('historyCleared');
  }

  /**
   * Execute an agent with the given input and timeout.
   * Simulates AI-driven agent execution by parsing the system prompt and input.
   */
  async executeAgent(
    agent: { role: string; agent_ref: string; system_prompt?: string },
    input: Record<string, unknown>,
    _timeout: number,
  ): Promise<{ role: string; agentRef: string; status: 'completed' | 'failed'; input: Record<string, unknown>; output: Record<string, unknown>; retries: number; }> {
    const prompt = agent.system_prompt ?? `You are the ${agent.role}`;

    // Simulate agent execution — construct plausible output from prompt and input
    const output: Record<string, unknown> = {
      role: agent.role,
      prompt,
      summary: `Agent "${agent.role}" processed input with prompt: ${prompt.slice(0, 50)}...`,
    };

    return {
      role: agent.role,
      agentRef: agent.agent_ref,
      status: 'completed',
      input,
      output,
      retries: 0,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AssistantConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.config.autoSuggest) {
      this.startAutoSuggest();
    } else {
      this.stopAutoSuggest();
    }
    
    this.emit('configUpdated', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): AssistantConfig {
    return { ...this.config };
  }
}
