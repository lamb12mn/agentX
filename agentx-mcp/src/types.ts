/** 支持的资产类型 */
export type AssetType = 'skill' | 'mcp' | 'prompt' | 'rule' | 'workflow' | 'agent' | 'team';

/** 资产元数据 */
export interface AssetMeta {
  /** 唯一标识 */
  id: string;
  /** 资产类型 */
  type: AssetType;
  /** 资产名称 */
  name: string;
  /** 可选描述 */
  description?: string;
  /** 标签列表 */
  tags: string[];
  /** 存储文件路径 */
  file_path: string;
  /** 创建时间戳 */
  created_at: number;
  /** 更新时间戳 */
  updated_at: number;
}

/** Agent 配置 */
export interface AgentConfig {
  /** Agent 名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 可选描述 */
  description?: string;
  /** 角色提示词 */
  role_prompt?: string;
  /** 关联规则列表 */
  rules: string[];
  /** 关联技能列表 */
  skills: string[];
  /** MCP 配置列表 */
  mcps: McpConfig[];
  /** 关联工作流 */
  workflow?: string;
}

/** MCP 服务配置 */
export interface McpConfig {
  /** 服务名称 */
  name: string;
  /** 启动命令 */
  command: string;
  /** 命令行参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 是否启用 */
  enabled: boolean;
}

/** 团队配置 — 多智能体编排定义 */
export interface TeamConfig {
  /** 团队名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 可选描述 */
  description?: string;
  /** 团队成员 */
  agents: TeamAgent[];
  /** 执行流程步骤 (from→to pipeline) */
  workflow: TeamWorkflowStep[];
  /** 输入/输出变量映射 */
  variables?: TeamVariable[];
  /** 重试策略 */
  retry?: { maxRetries: number; backoffMs: number };
  /** 超时 (ms) */
  timeout?: number;
  /** 执行完成后的 webhook 回调 */
  webhook?: TeamWebhook;
}

/** Webhook 回调配置 */
export interface TeamWebhook {
  /** 回调 URL */
  url: string;
  /** 触发事件列表 */
  events: ('start' | 'step.complete' | 'step.failed' | 'complete' | 'all')[];
  /** 可选自定义请求头 */
  headers?: Record<string, string>;
}

/** 团队成员定义 */
export interface TeamAgent {
  /** 角色名称 (如 researcher, writer) */
  role: string;
  /** 引用的 Agent 资产 ID 或名称 */
  agent_ref: string;
  /** 可选的角色覆写提示词 */
  system_prompt?: string;
  /** 是否必须 (失败则整个团队执行失败) */
  required?: boolean;
  /** 代理类型: 'ai' (默认) 或 'human' (需人工审批) */
  agent_type?: 'ai' | 'human';
  /** 人工审批超时 (ms)，默认 300_000 (5分钟) */
  approval_timeout?: number;
}

/** 团队工作流步骤 */
export interface TeamWorkflowStep {
  /** 输入角色 */
  from: string;
  /** 输出角色 */
  to: string;
  /** 可选条件 (如 "output.confidence >= 0.8") */
  condition?: string;
  /** 输入上下文模板 ({{variable}} 格式) */
  input_template?: string;
  /** 嵌套子团队配置 (递归执行) */
  sub_team?: TeamConfig;
}

/** 变量映射 */
export interface TeamVariable {
  name: string;
  source: 'input' | 'step_output';
  step_role?: string;
  field?: string;
}

/** 搜索结果条目 */
export interface SearchResult {
  /** 匹配的资产元数据 */
  meta: AssetMeta;
  /** 相关性评分 */
  score: number;
  /** 匹配片段 */
  snippet?: string;
}

/** 批量导入结果 */
export interface ImportResult {
  /** 成功导入的资产列表 */
  imported: AssetMeta[];
  /** 跳过的资产名称列表 */
  skipped: string[];
  /** 错误信息列表 */
  errors: string[];
}
