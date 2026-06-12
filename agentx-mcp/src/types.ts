/** 支持的资产类型 */
export type AssetType = 'skill' | 'mcp' | 'prompt' | 'rule' | 'workflow' | 'agent';

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
