export type AssetType = 'skill' | 'mcp' | 'prompt' | 'rule' | 'workflow' | 'agent';

export interface AssetMeta {
  id: string;
  type: AssetType;
  name: string;
  description?: string;
  tags: string[];
  file_path: string;
  created_at: number;
  updated_at: number;
}

export interface AgentConfig {
  name: string;
  version: string;
  description?: string;
  role_prompt?: string;
  rules: string[];
  skills: string[];
  mcps: McpConfig[];
  workflow?: string;
}

export interface McpConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface SearchResult {
  meta: AssetMeta;
  score: number;
  snippet?: string;
}

export interface ImportResult {
  imported: AssetMeta[];
  skipped: string[];
  errors: string[];
}
