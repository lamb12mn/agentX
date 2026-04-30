# AgentX API 参考文档

> 完整的 MCP 工具接口说明。AgentX 作为 MCP 服务器，向 Claude Code 等客户端暴露 33 个工具。

---

## 📖 目录

- [工具总览](#工具总览)
- [通用数据类型](#通用数据类型)
- [Skill 工具（5 个）](#skill工具5-个)
- [Prompt 工具（5 个）](#prompt工具5-个)
- [Rule 工具（5 个）](#rule工具5-个)
- [MCP 工具（5 个）](#mcp工具5-个)
- [Agent 工具（6 个）](#agent工具6-个)
- [Workflow 工具（5 个）](#workflow工具5-个)
- [Search 工具（1 个）](#search工具1-个)
- [Import 工具（1 个）](#import工具1-个)

---

## 工具总览

| 类别 | 工具数 | 工具列表 |
|------|--------|----------|
| **Skill** | 5 | `list_skills`, `get_skill`, `create_skill`, `update_skill`, `delete_skill` |
| **Prompt** | 5 | `list_prompts`, `get_prompt`, `create_prompt`, `update_prompt`, `delete_prompt` |
| **Rule** | 5 | `list_rules`, `get_rule`, `create_rule`, `update_rule`, `delete_rule` |
| **MCP** | 5 | `list_mcps`, `get_mcp`, `create_mcp`, `update_mcp`, `delete_mcp` |
| **Agent** | 6 | `list_agents`, `get_agent`, `create_agent`, `update_agent`, `delete_agent`, `export_agent` |
| **Workflow** | 5 | `list_workflows`, `get_workflow`, `create_workflow`, `update_workflow`, `delete_workflow` |
| **Search** | 1 | `search_assets` |
| **Import** | 1 | `import_from_claude` |
| **总计** | **33** | - |

---

## 通用数据类型

### AssetMeta

所有资产的元数据。

```typescript
interface AssetMeta {
  id: string;              // UUID 唯一标识
  type: AssetType;         // 资产类型
  name: string;            // 资产名称
  description?: string;    // 描述（可选）
  tags: string[];          // 标签数组
  file_path: string;       // 文件路径
  created_at: number;      // 创建时间戳（毫秒）
  updated_at: number;      // 更新时间戳（毫秒）
}
```

### AssetType

```typescript
type AssetType = 'skill' | 'prompt' | 'rule' | 'mcp' | 'workflow' | 'agent';
```

### AgentConfig

智能体配置（YAML 格式解析后）。

```typescript
interface AgentConfig {
  name: string;             // 智能体名称
  version: string;          // 版本号（如 "1.0.0"）
  description?: string;     // 描述
  role_prompt?: string;     // 角色提示词（文件路径或内联内容）
  rules: string[];          // 规则列表（ID 或文件路径）
  skills: string[];         // 技能列表（ID 或文件路径）
  mcps: McpConfig[];        // MCP 配置数组
  workflow?: string;        // 工作流文件路径（可选）
}
```

### McpConfig

MCP 服务器配置。

```typescript
interface McpConfig {
  name: string;             // MCP 名称
  command: string;          // 启动命令
  args?: string[];          // 命令行参数
  env?: Record<string, string>;  // 环境变量
  enabled: boolean;         // 是否启用
}
```

### SearchResult

搜索结果。

```typescript
interface SearchResult {
  meta: AssetMeta;          // 资产元数据
  score: number;            // 相关度分数（0-1）
  snippet?: string;         // 匹配片段（可选）
}
```

### ImportResult

导入结果。

```typescript
interface ImportResult {
  imported: AssetMeta[];    // 成功导入的资产
  skipped: string[];        // 跳过的资产名称
  errors: string[];         // 错误信息
}
```

---

## Skill 工具（5 个）

### 1. list_skills

列出所有技能。

**描述**：`List all skills`

**输入参数**：无

**返回值**：`AssetMeta[]`

**示例**：
```json
{
  "tools": [
    {
      "name": "list_skills",
      "description": "List all skills",
      "inputSchema": {
        "type": "object",
        "properties": {}
      }
    }
  ]
}
```

**调用**：
```javascript
// Claude Code 自动调用，无需参数
{
  "name": "list_skills",
  "arguments": {}
}
```

**响应**：
```json
[
  {
    "id": "a1b2c3d4-...",
    "type": "skill",
    "name": "code-review",
    "description": "专业的代码审查助手",
    "tags": ["dev", "review"],
    "file_path": "/Users/alice/.agentx/skills/a1b2c3d4/skill.md",
    "created_at": 1714320000000,
    "updated_at": 1714406400000
  }
]
```

---

### 2. get_skill

获取单个技能的详细信息（包含内容）。

**描述**：`Get a skill by id`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`AssetMeta | null`

**示例调用**：
```json
{
  "name": "get_skill",
  "arguments": {
    "id": "a1b2c3d4-..."
  }
}
```

**响应**：
```json
{
  "id": "a1b2c3d4-...",
  "type": "skill",
  "name": "code-review",
  "description": "专业的代码审查助手",
  "tags": ["dev", "review"],
  "file_path": "/Users/alice/.agentx/skills/a1b2c3d4/skill.md",
  "created_at": 1714320000000,
  "updated_at": 1714406400000,
  "content": "# 代码审查\n\n## 职责\n- 检查代码质量..."
}
```

**注意**：返回的 `AssetMeta` 对象会额外包含 `content` 字段（文件内容）。

---

### 3. create_skill

创建新技能。

**描述**：`Create a new skill`

**输入参数**：
```typescript
{
  name: string,           // 必需：技能名称
  content: string,        // 必需：技能内容（Markdown）
  description?: string,   // 可选：描述
  tags?: string[]         // 可选：标签数组
}
```

**返回值**：`AssetMeta`

**示例调用**：
```json
{
  "name": "create_skill",
  "arguments": {
    "name": "performance-optimization",
    "content": "# 性能优化\n\n## 检查点\n- 避免 N+1 查询\n- 使用缓存\n- 减少重渲染",
    "description": "性能优化最佳实践",
    "tags": ["performance", "optimization"]
  }
}
```

**响应**：
```json
{
  "id": "e5f6g7h8-...",
  "type": "skill",
  "name": "performance-optimization",
  "description": "性能优化最佳实践",
  "tags": ["performance", "optimization"],
  "file_path": "/Users/alice/.agentx/skills/e5f6g7h8/skill.md",
  "created_at": 1714492800000,
  "updated_at": 1714492800000
}
```

**文件存储**：`~/.agentx/skills/{id}/skill.md`

---

### 4. update_skill

更新技能元数据或内容。

**描述**：`Update a skill metadata and/or file content`

**输入参数**：
```typescript
{
  id: string,            // 必需：资产 ID
  name?: string,         // 可选：新名称
  description?: string,  // 可选：新描述
  tags?: string[],       // 可选：新标签
  content?: string       // 可选：新内容
}
```

**返回值**：`AssetMeta`（更新后的元数据）

**示例调用**：
```json
{
  "name": "update_skill",
  "arguments": {
    "id": "a1b2c3d4-...",
    "description": "更新描述：高级代码审查助手",
    "tags": ["dev", "review", "advanced"],
    "content": "# 代码审查（更新版）\n\n## 新增\n- 安全检查\n- 性能分析"
  }
}
```

**说明**：
- 可只更新部分字段（如仅更新 `tags`）
- `content` 会覆盖整个文件
- 必须提供 `id`

---

### 5. delete_skill

删除技能。

**描述**：`Delete a skill by id`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`void`

**示例调用**：
```json
{
  "name": "delete_skill",
  "arguments": {
    "id": "a1b2c3d4-..."
  }
}
```

**响应**：无内容（成功）或抛出错误

**注意**：
- 删除不可恢复
- 同时删除数据库记录和物理文件
- 如果技能被智能体引用，引用将失效

---

## Prompt 工具（5 个）

### 1. list_prompts

列出所有提示词。

**描述**：`List all prompts`

**输入参数**：无

**返回值**：`AssetMeta[]`

**示例**：同 `list_skills`，类型为 `prompt`。

---

### 2. get_prompt

获取提示词详情（包含内容）。

**描述**：`Get a prompt by id, returns metadata and file content`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`{ meta: AssetMeta; content: string } | null`

**示例响应**：
```json
{
  "meta": {
    "id": "b2c3d4e5-...",
    "type": "prompt",
    "name": "code-expert",
    "tags": ["role", "expert"],
    ...
  },
  "content": "# 代码专家角色\n\n你是经验丰富的软件工程师..."
}
```

**注意**：与 `get_skill` 不同，返回对象包含 `meta` 和 `content` 两个字段。

---

### 3. create_prompt

创建新提示词。

**描述**：`Create a new prompt`

**输入参数**：
```typescript
{
  name: string,           // 必需：提示词名称
  content: string,        // 必需：提示词内容
  description?: string,   // 可选：描述
  tags?: string[]         // 可选：标签
}
```

**返回值**：`AssetMeta`

**文件存储**：`~/.agentx/prompts/{id}.md`

---

### 4. update_prompt

更新提示词。

**描述**：`Update a prompt metadata and/or file content`

**输入参数**：
```typescript
{
  id: string,            // 必需：资产 ID
  name?: string,         // 可选：新名称
  description?: string,  // 可选：新描述
  tags?: string[],       // 可选：新标签
  content?: string       // 可选：新内容
}
```

**返回值**：`AssetMeta`

---

### 5. delete_prompt

删除提示词。

**描述**：`Delete a prompt by id`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`void`

---

## Rule 工具（5 个）

### 1. list_rules

列出所有规则。

**描述**：`List all rules`

**输入参数**：无

**返回值**：`AssetMeta[]`

---

### 2. get_rule

获取规则详情（包含内容）。

**描述**：`Get a rule by id, returns metadata and file content`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`{ meta: AssetMeta; content: string } | null`

---

### 3. create_rule

创建新规则。

**描述**：`Create a new rule`

**输入参数**：
```typescript
{
  name: string,           // 必需：规则名称
  content: string,        // 必需：规则内容
  description?: string,   // 可选：描述
  tags?: string[]         // 可选：标签
}
```

**返回值**：`AssetMeta`

**文件存储**：`~/.agentx/rules/{id}.md`

---

### 4. update_rule

更新规则。

**描述**：`Update a rule metadata and/or file content`

**输入参数**：
```typescript
{
  id: string,            // 必需：资产 ID
  name?: string,         // 可选：新名称
  description?: string,  // 可选：新描述
  tags?: string[],       // 可选：新标签
  content?: string       // 可选：新内容
}
```

**返回值**：`AssetMeta`

---

### 5. delete_rule

删除规则。

**描述**：`Delete a rule by id`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`void`

---

## MCP 工具（5 个）

### 1. list_mcps

列出所有 MCP 配置。

**描述**：`List all MCP server configurations`

**输入参数**：无

**返回值**：`AssetMeta[]`

**注意**：返回的是 MCP 配置文件的元数据，不包含解析后的配置内容。使用 `get_mcp` 获取完整配置。

---

### 2. get_mcp

获取 MCP 配置详情。

**描述**：`Get an MCP server configuration by id, returns metadata and parsed McpConfig`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`{ meta: AssetMeta; config: McpConfig } | null`

**示例响应**：
```json
{
  "meta": {
    "id": "c3d4e5f6-...",
    "type": "mcp",
    "name": "filesystem",
    ...
  },
  "config": {
    "name": "filesystem",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem"],
    "env": {
      "ALLOWED_PATHS": "/Users/alice/projects"
    },
    "enabled": true
  }
}
```

**注意**：`config` 字段是从 YAML 文件解析后的 `McpConfig` 对象。

---

### 3. create_mcp

创建 MCP 配置。

**描述**：`Create a new MCP server configuration`

**输入参数**：
```typescript
{
  name: string,           // 必需：MCP 名称
  config: McpConfig,      // 必需：MCP 配置对象
  description?: string,   // 可选：描述
  tags?: string[]         // 可选：标签
}
```

**返回值**：`AssetMeta`

**McpConfig 结构**：
```typescript
{
  name: string,           // 与资产名称一致
  command: string,        // 启动命令（如 "npx"、"node"）
  args?: string[],        // 命令行参数数组
  env?: Record<string, string>,  // 环境变量
  enabled: boolean        // 是否启用
}
```

**示例调用**：
```json
{
  "name": "create_mcp",
  "arguments": {
    "name": "github",
    "config": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "enabled": true
    },
    "description": "GitHub API 访问",
    "tags": ["git", "api"]
  }
}
```

**文件存储**：`~/.agentx/mcps/{name}.json`（注意：文件名使用 `name` 而非 `id`）

---

### 4. update_mcp

更新 MCP 元数据。

**描述**：`Update an MCP server configuration metadata`

**输入参数**：
```typescript
{
  id: string,            // 必需：资产 ID
  name?: string,         // 可选：新名称
  description?: string,  // 可选：新描述
  tags?: string[]        // 可选：新标签
}
```

**返回值**：`AssetMeta`

**注意**：
- MCP 配置的 `config` 字段（command、args、env、enabled）不能通过此工具更新
- 要修改配置内容，需直接编辑文件或使用 `update_agent` 中的 MCP 引用
- 文件名与 `name` 字段绑定，重命名会移动文件

---

### 5. delete_mcp

删除 MCP 配置。

**描述**：`Delete an MCP server configuration by id`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`void`

---

## Agent 工具（6 个）

### 1. list_agents

列出所有智能体。

**描述**：`List all agents`

**输入参数**：无

**返回值**：`AssetMeta[]`

---

### 2. get_agent

获取智能体详情（包含配置）。

**描述**：`Get an agent by id, returns metadata and parsed AgentConfig`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`{ meta: AssetMeta; config: AgentConfig } | null`

**示例响应**：
```json
{
  "meta": {
    "id": "d4e5f6g7-...",
    "type": "agent",
    "name": "my-code-assistant",
    ...
  },
  "config": {
    "name": "my-code-assistant",
    "version": "1.0.0",
    "description": "代码审查助手",
    "role_prompt": "prompts/code-expert",
    "rules": ["rules/no-sensitive-data.md"],
    "skills": ["skills/code-review.md"],
    "mcps": [
      {
        "name": "filesystem",
        "enabled": true
      }
    ]
  }
}
```

**注意**：
- `role_prompt`、`rules`、`skills` 存储为文件路径（相对 `~/.agentx/`）
- `mcps` 是 `McpConfig` 对象数组

---

### 3. create_agent

创建智能体。

**描述**：`Create a new agent`

**输入参数**：
```typescript
{
  name: string,           // 必需：智能体名称
  config: AgentConfig,    // 必需：智能体配置对象
  description?: string,   // 可选：描述
  tags?: string[]         // 可选：标签
}
```

**返回值**：`AssetMeta`

**AgentConfig 必填字段**：
- `name`（智能体内部名称）
- `skills`（至少一个技能）

**示例调用**：
```json
{
  "name": "create_agent",
  "arguments": {
    "name": "my-agent",
    "description": "我的第一个智能体",
    "config": {
      "name": "my-agent",
      "version": "1.0.0",
      "role_prompt": "你是一个有帮助的助手",
      "rules": [],
      "skills": ["skills/code-review.md"],
      "mcps": []
    }
  }
}
```

**文件存储**：`~/.agentx/agents/{id}/agent.yaml`

---

### 4. update_agent

更新智能体元数据。

**描述**：`Update an agent`

**输入参数**：
```typescript
{
  id: string,            // 必需：资产 ID
  name?: string,         // 可选：新名称
  description?: string,  // 可选：新描述
  tags?: string[]        // 可选：新标签
}
```

**返回值**：`AssetMeta`

**注意**：
- 此工具**仅更新元数据**（name、description、tags）
- 要修改 `config`（role_prompt、rules、skills、mcps），需直接编辑 `agent.yaml` 文件
- 设计限制：config 更新需在后续版本实现

---

### 5. delete_agent

删除智能体。

**描述**：`Delete an agent by id`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`void`

**注意**：
- 删除整个 `agents/{id}/` 目录
- 同时删除 `agent_components` 关联表记录

---

### 6. export_agent

导出智能体为 Claude Code 格式。

**描述**：`Export an agent to CLAUDE.md + settings.json in the specified output directory`

**输入参数**：
```typescript
{
  id: string,          // 必需：智能体 ID
  output_dir: string   // 必需：输出目录路径
}
```

**返回值**：
```typescript
{
  claude_md_path: string,     // CLAUDE.md 文件路径
  settings_json_path: string  // settings.json 文件路径
}
```

**示例调用**：
```json
{
  "name": "export_agent",
  "arguments": {
    "id": "d4e5f6g7-...",
    "output_dir": "/Users/alice/my-agent"
  }
}
```

**响应**：
```json
{
  "claude_md_path": "/Users/alice/my-agent/CLAUDE.md",
  "settings_json_path": "/Users/alice/my-agent/settings.json"
}
```

**生成的文件**：

`CLAUDE.md`：
```markdown
# my-agent

智能体描述

## Role

（role_prompt 内容）

## Rules

- rule-1
- rule-2

## Skills

- skill-1
- skill-2

## MCPs

启用的 MCP 服务器列表
```

`settings.json`：
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {}
    }
  }
}
```

**使用**：
1. 复制两个文件到项目根目录
2. 在 Claude Code 中打开项目
3. 智能体自动生效

---

## Workflow 工具（5 个）

### 1. list_workflows

列出所有工作流。

**描述**：`List all workflows`

**输入参数**：无

**返回值**：`AssetMeta[]`

---

### 2. get_workflow

获取工作流详情（包含内容）。

**描述**：`Get a workflow by id, returns metadata and file content`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`{ meta: AssetMeta; content: string } | null`

---

### 3. create_workflow

创建工作流。

**描述**：`Create a new workflow`

**输入参数**：
```typescript
{
  name: string,           // 必需：工作流名称
  content: string,        // 必需：YAML 格式的工作流定义
  description?: string,   // 可选：描述
  tags?: string[]         // 可选：标签
}
```

**返回值**：`AssetMeta`

**文件存储**：`~/.agentx/workflows/{id}.yaml`

**YAML 格式示例**：
```yaml
name: "代码审查流程"
steps:
  - id: "scan"
    type: "skill"
    skill: "code-scan"
    next: "analyze"

  - id: "analyze"
    type: "skill"
    skill: "code-analyze"
    next: "report"

  - id: "report"
    type: "skill"
    skill: "generate-report"
```

---

### 4. update_workflow

更新工作流。

**描述**：`Update a workflow metadata and/or file content`

**输入参数**：
```typescript
{
  id: string,            // 必需：资产 ID
  name?: string,         // 可选：新名称
  description?: string,  // 可选：新描述
  tags?: string[],       // 可选：新标签
  content?: string       // 可选：新内容（YAML）
}
```

**返回值**：`AssetMeta`

---

### 5. delete_workflow

删除工作流。

**描述**：`Delete a workflow by id`

**输入参数**：
```typescript
{
  id: string  // 必需：资产 ID
}
```

**返回值**：`void`

---

## Search 工具（1 个）

### search_assets

全文搜索所有资产。

**描述**：`Full-text search across all assets (skills, prompts, rules, mcps, agents, workflows) by name, description, and content`

**输入参数**：
```typescript
{
  query: string,         // 必需：搜索查询（FTS5 语法）
  type?: AssetType,      // 可选：按资产类型过滤
  limit?: number         // 可选：最大结果数（默认 20）
}
```

**返回值**：`SearchResult[]`

**示例调用**：
```json
{
  "name": "search_assets",
  "arguments": {
    "query": "代码审查",
    "type": "skill",
    "limit": 10
  }
}
```

**响应**：
```json
[
  {
    "meta": {
      "id": "a1b2c3d4-...",
      "type": "skill",
      "name": "code-review",
      "description": "专业的代码审查助手",
      "tags": ["dev", "review"]
    },
    "score": 0.85,
    "snippet": "...代码审查...检查质量..."
  }
]
```

**搜索特性**：
- 基于 SQLite FTS5 全文索引
- 支持布尔查询：`"代码审查" AND "安全"`
- 支持前缀匹配：`"review*"`
- 结果按相关度排序（`score` 字段）

---

## Import 工具（1 个）

### import_from_claude

从 Claude Code 本地目录导入资产。

**描述**：`Import skills, rules, or prompts from Claude Code local directories into AgentX`

**输入参数**：
```typescript
{
  type: AssetType,       // 必需：资产类型（仅支持 'skill' | 'prompt' | 'rule'）
  source_dir?: string,   // 可选：源目录路径（默认：Claude Code 默认目录）
  tags?: string[]        // 可选：导入后添加的标签
}
```

**返回值**：`ImportResult`

**示例调用**：
```json
{
  "name": "import_from_claude",
  "arguments": {
    "type": "skill",
    "source_dir": "/Users/alice/my-skills",
    "tags": ["imported", "custom"]
  }
}
```

**响应**：
```json
{
  "imported": [
    {
      "id": "f6g7h8i9-...",
      "type": "skill",
      "name": "my-skill",
      ...
    }
  ],
  "skipped": ["existing-skill"],
  "errors": []
}
```

**默认源目录**：
- `type: 'skill'` → `~/.claude/skills/`
- `type: 'prompt'` → `~/.claude/prompts/`
- `type: 'rule'` → 当前工作目录（查找 `CLAUDE.md`）

**导入逻辑**：
1. 扫描源目录所有 `.md` 文件
2. 文件名作为资产名称
3. 文件内容作为资产内容
4. 去重：同名资产跳过
5. 添加指定标签

---

## 🔧 通用说明

### 错误处理

所有工具在出错时返回错误响应：

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Asset not found: xyz"
    }
  ],
  "isError": true
}
```

**常见错误**：
- `Asset not found`：ID 不存在
- `Failed to parse ...`：YAML/JSON 解析失败
- `Permission denied`：文件系统权限不足
- `SQLITE_CANTOPEN`：数据库无法打开

---

### 数据验证

所有输入参数通过 Zod 或手动验证：
- 必填字段缺失 → 错误
- 类型不匹配 → 错误
- 枚举值无效 → 错误

---

### 性能特性

- **响应时间**：< 100ms（本地 SQLite 索引）
- **并发**：工具调用串行执行（MCP 协议限制）
- **缓存**：无（每次调用读取最新数据）

---

## 📚 进阶使用

### 工具组合示例

**场景**：创建一个完整的智能体

```javascript
// 1. 创建技能
create_skill({
  name: "code-review",
  content: "...",
  tags: ["dev"]
});

// 2. 创建规则
create_rule({
  name: "no-sensitive",
  content: "..."
});

// 3. 创建智能体
create_agent({
  name: "my-assistant",
  config: {
    name: "my-assistant",
    version: "1.0.0",
    role_prompt: "你是一个代码助手",
    rules: ["rules/no-sensitive.md"],
    skills: ["skills/code-review.md"],
    mcps: []
  }
});

// 4. 导出
export_agent({
  id: "agent-id-xxx",
  output_dir: "/path/to/export"
});
```

---

## 🔄 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-04-29 | 初始版本，33 个 MCP 工具 |

---

*文档版本：1.0.0 | 最后更新：2026-04-29*
