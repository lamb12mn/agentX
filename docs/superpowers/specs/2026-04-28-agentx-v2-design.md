# AgentX v0.2 深化需求设计文档

**版本：** v0.2 | **日期：** 2026-04-28  
**状态：** 草稿  
**作者：** 需求设计子智能体

---

## 目录

1. [补全 MVP 缺口（立即）](#1-补全-mvp-缺口立即)
2. [工具 Schema 完善（短期）](#2-工具-schema-完善短期)
3. [全文搜索（中期）](#3-全文搜索中期)
4. [从 Claude Code 导入（中期，差异化核心）](#4-从-claude-code-导入中期差异化核心)
5. [数据模型扩展](#5-数据模型扩展)
6. [成功标准](#6-成功标准)

---

## 1. 补全 MVP 缺口（立即）

### 1.1 修复 `update_skill` 缺少 `content` 参数

**问题根因：**  
`tools/skills.ts` 第 16-19 行的 `update_skill` handler 类型定义中没有 `content` 字段，导致调用者无法更新 skill 的文件内容。`store/assets.ts` 的 `updateAsset` 函数也只更新元数据（name/description/tags），不写文件。

**修改点 1：`agentx-mcp/src/store/assets.ts`**

在 `UpdateAssetInput` 接口（第 14-18 行）增加 `content` 字段，并在 `updateAsset` 函数（第 87-108 行）中处理文件写入：

```typescript
// 修改前（第 14-18 行）
interface UpdateAssetInput {
  name?: string;
  description?: string;
  tags?: string[];
}

// 修改后
interface UpdateAssetInput {
  name?: string;
  description?: string;
  tags?: string[];
  content?: string;  // 新增：文件内容
}

// updateAsset 函数内（第 87 行之后，run() 调用之前）插入：
export async function updateAsset(id: string, input: UpdateAssetInput): Promise<AssetMeta> {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) throw new Error(`Asset not found: ${id}`);

  // 新增：如果提供了 content，写入文件
  if (input.content !== undefined) {
    const filePath = existing.file_path as string;
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content, 'utf-8');
  }

  const name = input.name ?? (existing.name as string);
  const description =
    input.description !== undefined ? input.description : (existing.description as string | null);
  const tags = input.tags !== undefined ? JSON.stringify(input.tags) : (existing.tags as string);

  db.prepare(
    `UPDATE assets SET name = ?, description = ?, tags = ?, updated_at = ? WHERE id = ?`
  ).run(name, description, tags, now, id);

  return rowToMeta(
    db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Record<string, unknown>
  );
}
```

注意：`mkdir` 和 `writeFile` 已在文件顶部导入（第 1 行），`dirname` 已导入（第 2 行），无需新增 import。

**修改点 2：`agentx-mcp/src/tools/skills.ts`**

第 16-19 行的 `update_skill` 类型定义增加 `content` 字段，第 43-44 行的 handler 传递 `content`：

```typescript
// 修改前（第 16-19 行）
update_skill: ToolHandler<
  { id: string; name?: string; description?: string; tags?: string[] },
  AssetMeta
>;

// 修改后
update_skill: ToolHandler<
  { id: string; name?: string; description?: string; tags?: string[]; content?: string },
  AssetMeta
>;

// 修改前（第 41-45 行）
update_skill: {
  description: 'Update a skill',
  handler: async ({ id, name, description, tags }) =>
    updateAsset(id, { name, description, tags }),
},

// 修改后
update_skill: {
  description: 'Update a skill metadata and/or file content',
  handler: async ({ id, name, description, tags, content }) =>
    updateAsset(id, { name, description, tags, content }),
},
```

---

### 1.2 在 `index.ts` 中注册 prompts/rules/mcps 工具

**问题根因：**  
`index.ts` 第 7-8 行只导入并注册了 `skills` 和 `agents` 工具。prompts、rules、mcps 的工具文件尚不存在，需要先创建，再在 `index.ts` 中注册。

**步骤一：创建 `agentx-mcp/src/tools/prompts.ts`**

```typescript
// agentx-mcp/src/tools/prompts.ts
import { createAsset, getAsset, listAssets, updateAsset, deleteAsset, readAssetContent } from '../store/assets.js';
import type { AssetMeta } from '../types.js';

interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: object;
  handler: (input: TInput) => Promise<TOutput>;
}

export interface PromptTools {
  list_prompts: ToolHandler<Record<string, never>, AssetMeta[]>;
  get_prompt: ToolHandler<{ id: string }, { meta: AssetMeta; content: string } | null>;
  create_prompt: ToolHandler<
    { name: string; content: string; description?: string; tags?: string[] },
    AssetMeta
  >;
  update_prompt: ToolHandler<
    { id: string; name?: string; description?: string; tags?: string[]; content?: string },
    AssetMeta
  >;
  delete_prompt: ToolHandler<{ id: string }, void>;
}

export function registerPromptTools(baseDir: string): PromptTools {
  return {
    list_prompts: {
      description: 'List all prompt assets',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => listAssets('prompt'),
    },
    get_prompt: {
      description: 'Get a prompt by id, returns metadata and file content',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Prompt asset ID' } },
        required: ['id'],
      },
      handler: async ({ id }) => {
        const meta = await getAsset(id);
        if (!meta) return null;
        const content = await readAssetContent(id);
        return { meta, content };
      },
    },
    create_prompt: {
      description: 'Create a new prompt asset',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          content: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'content'],
      },
      handler: async ({ name, content, description, tags }) =>
        createAsset({ type: 'prompt', name, description, tags: tags ?? [] }, content, baseDir),
    },
    update_prompt: {
      description: 'Update a prompt asset metadata and/or content',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          content: { type: 'string' },
        },
        required: ['id'],
      },
      handler: async ({ id, name, description, tags, content }) =>
        updateAsset(id, { name, description, tags, content }),
    },
    delete_prompt: {
      description: 'Delete a prompt asset by id',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: async ({ id }) => deleteAsset(id),
    },
  };
}
```

**步骤二：创建 `agentx-mcp/src/tools/rules.ts`**

结构与 `prompts.ts` 完全对称，将所有 `prompt` 替换为 `rule`，工具名前缀改为 `list_rules` / `get_rule` / `create_rule` / `update_rule` / `delete_rule`，`AssetType` 使用 `'rule'`。（代码略，模式同上）

**步骤三：创建 `agentx-mcp/src/tools/mcps.ts`**

MCP 资产存储为 YAML 格式（`McpConfig`），需要 `js-yaml` 序列化：

```typescript
// agentx-mcp/src/tools/mcps.ts
import yaml from 'js-yaml';
import { createAsset, getAsset, listAssets, updateAsset, deleteAsset, readAssetContent } from '../store/assets.js';
import type { AssetMeta, McpConfig } from '../types.js';

export function registerMcpTools(baseDir: string) {
  return {
    list_mcps: {
      description: 'List all MCP configurations',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => listAssets('mcp'),
    },
    get_mcp: {
      description: 'Get an MCP config by id',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: async ({ id }: { id: string }) => {
        const meta = await getAsset(id);
        if (!meta) return null;
        const content = await readAssetContent(id);
        const config = yaml.load(content) as McpConfig;
        return { meta, config };
      },
    },
    create_mcp: {
      description: 'Create a new MCP configuration',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          config: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              command: { type: 'string' },
              args: { type: 'array', items: { type: 'string' } },
              env: { type: 'object' },
              enabled: { type: 'boolean' },
            },
            required: ['name', 'command', 'enabled'],
          },
        },
        required: ['name', 'config'],
      },
      handler: async ({ name, description, tags, config }: {
        name: string;
        description?: string;
        tags?: string[];
        config: McpConfig;
      }) => {
        const content = yaml.dump(config);
        return createAsset({ type: 'mcp', name, description, tags: tags ?? [] }, content, baseDir);
      },
    },
    update_mcp: {
      description: 'Update an MCP configuration',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          config: { type: 'object' },
        },
        required: ['id'],
      },
      handler: async ({ id, name, description, tags, config }: {
        id: string;
        name?: string;
        description?: string;
        tags?: string[];
        config?: McpConfig;
      }) => {
        const content = config ? yaml.dump(config) : undefined;
        return updateAsset(id, { name, description, tags, content });
      },
    },
    delete_mcp: {
      description: 'Delete an MCP configuration by id',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: async ({ id }: { id: string }) => deleteAsset(id),
    },
  };
}
```

**步骤四：修改 `agentx-mcp/src/index.ts`**

在第 7-8 行的 import 块之后增加新导入，并在 `allTools` 合并时加入：

```typescript
// 修改后的 index.ts（完整版）
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from './store/db.js';
import { registerSkillTools } from './tools/skills.js';
import { registerAgentTools } from './tools/agents.js';
import { registerPromptTools } from './tools/prompts.js';   // 新增
import { registerRuleTools } from './tools/rules.js';       // 新增
import { registerMcpTools } from './tools/mcps.js';         // 新增

// 工具定义类型（含 inputSchema）
type AnyHandler = {
  description: string;
  inputSchema: object;
  handler: (input: never) => Promise<unknown>;
};

const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
const dbPath = join(baseDir, 'agentx.db');

initDb(dbPath);

const skillTools = registerSkillTools(baseDir);
const agentTools = registerAgentTools(baseDir);
const promptTools = registerPromptTools(baseDir);   // 新增
const ruleTools = registerRuleTools(baseDir);       // 新增
const mcpTools = registerMcpTools(baseDir);         // 新增

const allTools: Record<string, AnyHandler> = {
  ...(skillTools as unknown as Record<string, AnyHandler>),
  ...(agentTools as unknown as Record<string, AnyHandler>),
  ...(promptTools as unknown as Record<string, AnyHandler>),  // 新增
  ...(ruleTools as unknown as Record<string, AnyHandler>),    // 新增
  ...(mcpTools as unknown as Record<string, AnyHandler>),     // 新增
};

const server = new Server(
  { name: 'agentx', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: { type: 'object' as const, ...tool.inputSchema },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = allTools[name];
  if (!tool) {
    return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
  }
  try {
    const result = await tool.handler(args as never);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: message }], isError: true };
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
```

**关键改动说明：**
- 第 34 行：`inputSchema` 从固定的 `{ type: 'object' }` 改为展开每个工具自己定义的 schema，这样 Claude 能看到参数结构。
- 新增 3 个工具模块注册，总工具数从 10 个增至 25 个。

---

## 2. 工具 Schema 完善（短期）

### 2.1 设计原则

当前 `index.ts` 第 34 行将所有工具的 `inputSchema` 硬编码为空对象 `{ type: 'object' }`，导致 Claude 无法推断参数。修复方案：**每个工具在定义时携带自己的 `inputSchema`**，`index.ts` 直接透传，不再覆盖。

### 2.2 Skills 工具完整 Schema

```typescript
// tools/skills.ts 中每个工具的 inputSchema

list_skills: {
  description: 'List all skill assets, optionally filtered by tags',
  inputSchema: {
    type: 'object',
    properties: {
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter skills that contain ALL of these tags',
      },
    },
    additionalProperties: false,
  },
  handler: async ({ tags }: { tags?: string[] }) => {
    const all = await listAssets('skill');
    if (!tags || tags.length === 0) return all;
    return all.filter((s) => tags.every((t) => s.tags.includes(t)));
  },
},

get_skill: {
  description: 'Get a skill by id, returns metadata and file content',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Skill asset UUID' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  handler: async ({ id }: { id: string }) => {
    const meta = await getAsset(id);
    if (!meta) return null;
    const content = await readAssetContent(id);
    return { meta, content };
  },
},

create_skill: {
  description: 'Create a new skill asset. Content should be Markdown describing the skill.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Unique skill name, used as filename' },
      content: { type: 'string', description: 'Skill content in Markdown format' },
      description: { type: 'string', description: 'Short human-readable description' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Categorization tags',
        default: [],
      },
    },
    required: ['name', 'content'],
    additionalProperties: false,
  },
  handler: async ({ name, content, description, tags }) =>
    createAsset({ type: 'skill', name, description, tags: tags ?? [] }, content, baseDir),
},

update_skill: {
  description: 'Update a skill asset. Provide only the fields you want to change.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Skill asset UUID' },
      name: { type: 'string', description: 'New name' },
      description: { type: 'string', description: 'New description' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Replace tags array' },
      content: { type: 'string', description: 'New file content (replaces entire file)' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  handler: async ({ id, name, description, tags, content }) =>
    updateAsset(id, { name, description, tags, content }),
},

delete_skill: {
  description: 'Permanently delete a skill asset and its file',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Skill asset UUID' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  handler: async ({ id }) => deleteAsset(id),
},
```

### 2.3 Agents 工具完整 Schema

```typescript
create_agent: {
  description: 'Create a new agent by composing skills, rules, prompts and MCPs',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Agent name' },
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' }, default: [] },
      config: {
        type: 'object',
        description: 'AgentConfig object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string', default: '1.0.0' },
          description: { type: 'string' },
          role_prompt: { type: 'string', description: 'System prompt / persona' },
          rules: {
            type: 'array',
            items: { type: 'string' },
            description: 'Rule asset IDs or inline rule strings',
          },
          skills: {
            type: 'array',
            items: { type: 'string' },
            description: 'Skill asset IDs',
          },
          mcps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                command: { type: 'string' },
                args: { type: 'array', items: { type: 'string' } },
                env: { type: 'object' },
                enabled: { type: 'boolean', default: true },
              },
              required: ['name', 'command', 'enabled'],
            },
          },
          workflow: { type: 'string', description: 'Workflow asset ID (optional)' },
        },
        required: ['name', 'version', 'rules', 'skills', 'mcps'],
      },
    },
    required: ['name', 'config'],
    additionalProperties: false,
  },
  handler: async ({ name, description, tags, config }) => {
    const content = yaml.dump(config);
    return createAsset({ type: 'agent', name, description, tags: tags ?? [] }, content, baseDir);
  },
},

export_agent: {
  description: 'Export an agent to CLAUDE.md + settings.json in the specified output directory',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Agent asset UUID' },
      output_dir: {
        type: 'string',
        description: 'Absolute path to the target project directory',
      },
    },
    required: ['id', 'output_dir'],
    additionalProperties: false,
  },
  handler: async ({ id, output_dir }) => { /* 现有实现不变 */ },
},
```

### 2.4 重构 `index.ts` 工具注册逻辑

**核心改动：** 将 `AnyHandler` 类型增加 `inputSchema` 字段，`ListToolsRequestSchema` handler 直接使用工具自带的 schema：

```typescript
// 修改前（index.ts 第 10 行）
type AnyHandler = { description: string; handler: (input: never) => Promise<unknown> };

// 修改后
type AnyHandler = {
  description: string;
  inputSchema: Record<string, unknown>;  // 每个工具自带
  handler: (input: never) => Promise<unknown>;
};

// 修改前（第 30-36 行）
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: { type: 'object' as const },  // 硬编码空 schema
  })),
}));

// 修改后
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(allTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,  // 透传工具自带 schema
  })),
}));
```

**理由：** 将 schema 定义权下放到各工具文件，`index.ts` 只做路由，符合单一职责原则。未来新增工具只需在对应文件中定义，不需要修改 `index.ts`。

---

## 3. 全文搜索（中期）

### 3.1 `search_assets` 工具接口设计

```typescript
// 工具名：search_assets
// 文件：agentx-mcp/src/tools/search.ts

interface SearchInput {
  query: string;           // 全文搜索关键词，支持 FTS5 语法
  types?: AssetType[];     // 可选：限定资产类型，如 ['skill', 'prompt']
  tags?: string[];         // 可选：标签过滤（AND 逻辑）
  limit?: number;          // 默认 20，最大 100
  offset?: number;         // 分页偏移，默认 0
}

interface SearchResult {
  items: Array<{
    meta: AssetMeta;
    snippet: string;       // FTS5 highlight 片段，含匹配上下文
    rank: number;          // BM25 相关性分数（越小越相关）
  }>;
  total: number;           // 匹配总数（不含 limit/offset）
  query: string;           // 回显查询词
}
```

**错误处理：**
- `query` 为空字符串 → 返回 `{ items: [], total: 0, query: '' }`，不报错
- `query` 包含 FTS5 语法错误 → catch SQLite 异常，返回 `{ isError: true, message: 'Invalid search query syntax' }`
- `limit` 超过 100 → 自动截断为 100

### 3.2 SQLite FTS5 全文索引方案

**建表 SQL（在 `store/db.ts` 的 `initDb` 中追加）：**

```sql
-- FTS5 虚拟表，对 name + description + content 建立全文索引
CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
  id UNINDEXED,        -- 不参与全文索引，仅用于 JOIN
  name,
  description,
  content,
  tokenize = 'unicode61 remove_diacritics 1'
);

-- 触发器：INSERT 时同步到 FTS
CREATE TRIGGER IF NOT EXISTS assets_fts_insert
AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(id, name, description, content)
  VALUES (new.id, new.name, COALESCE(new.description, ''), '');
END;

-- 触发器：UPDATE 时同步
CREATE TRIGGER IF NOT EXISTS assets_fts_update
AFTER UPDATE ON assets BEGIN
  UPDATE assets_fts
  SET name = new.name, description = COALESCE(new.description, '')
  WHERE id = new.id;
END;

-- 触发器：DELETE 时同步
CREATE TRIGGER IF NOT EXISTS assets_fts_delete
AFTER DELETE ON assets BEGIN
  DELETE FROM assets_fts WHERE id = old.id;
END;
```

**注意：** FTS 表的 `content` 列需要在写入文件后单独更新（触发器只能同步 `assets` 表字段）。文件内容通过 `updateFtsContent(id, content)` 函数手动同步。

**写入时同步逻辑（在 `store/assets.ts` 的 `createAsset` 和 `updateAsset` 中调用）：**

```typescript
// store/assets.ts 新增辅助函数
function syncFtsContent(id: string, content: string): void {
  const db = getDb();
  // FTS5 content 列需要 DELETE + INSERT 来更新（UPDATE 在 FTS5 中行为特殊）
  db.prepare('DELETE FROM assets_fts WHERE id = ?').run(id);
  const row = db.prepare('SELECT name, description FROM assets WHERE id = ?').get(id) as
    | { name: string; description: string | null }
    | undefined;
  if (row) {
    db.prepare('INSERT INTO assets_fts(id, name, description, content) VALUES (?, ?, ?, ?)').run(
      id,
      row.name,
      row.description ?? '',
      content
    );
  }
}

// 在 createAsset 的 writeFile 之后调用：
await writeFile(filePath, content, 'utf-8');
// ... INSERT INTO assets ...
syncFtsContent(id, content);  // 新增

// 在 updateAsset 的 writeFile 之后调用：
if (input.content !== undefined) {
  await writeFile(filePath, input.content, 'utf-8');
  syncFtsContent(id, input.content);  // 新增
}
```

### 3.3 `store/search.ts` 完整实现设计

```typescript
// agentx-mcp/src/store/search.ts
import { getDb } from './db.js';
import type { AssetMeta, AssetType } from '../types.js';

export interface SearchOptions {
  query: string;
  types?: AssetType[];
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface SearchResultItem {
  meta: AssetMeta;
  snippet: string;
  rank: number;
}

export interface SearchResult {
  items: SearchResultItem[];
  total: number;
  query: string;
}

function rowToMeta(row: Record<string, unknown>): AssetMeta {
  return {
    id: row.id as string,
    type: row.type as AssetType,
    name: row.name as string,
    description: row.description as string | undefined,
    tags: JSON.parse(row.tags as string) as string[],
    file_path: row.file_path as string,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

export function searchAssets(options: SearchOptions): SearchResult {
  const { query, types, tags, limit = 20, offset = 0 } = options;
  const db = getDb();

  if (!query.trim()) {
    return { items: [], total: 0, query };
  }

  const safeLimit = Math.min(limit, 100);

  // 构建 WHERE 子句
  const conditions: string[] = ['assets_fts MATCH ?'];
  const params: unknown[] = [query];

  // 类型过滤（JOIN 到 assets 表）
  let typeFilter = '';
  if (types && types.length > 0) {
    typeFilter = `AND a.type IN (${types.map(() => '?').join(',')})`;
    params.push(...types);
  }

  // 标签过滤（在应用层做，因为 tags 是 JSON 字符串）
  // 先查出候选结果，再在 JS 中过滤 tags

  try {
    // 查询总数（用于分页）
    const countSql = `
      SELECT COUNT(*) as cnt
      FROM assets_fts
      JOIN assets a ON assets_fts.id = a.id
      WHERE assets_fts MATCH ?
      ${typeFilter}
    `;
    const countRow = db.prepare(countSql).get(...params) as { cnt: number };

    // 查询结果，使用 FTS5 rank 和 snippet
    const searchSql = `
      SELECT
        a.*,
        snippet(assets_fts, 2, '<b>', '</b>', '...', 32) AS snippet,
        assets_fts.rank AS rank
      FROM assets_fts
      JOIN assets a ON assets_fts.id = a.id
      WHERE assets_fts MATCH ?
      ${typeFilter}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(searchSql).all(...params, safeLimit, offset) as Array<
      Record<string, unknown> & { snippet: string; rank: number }
    >;

    let items: SearchResultItem[] = rows.map((row) => ({
      meta: rowToMeta(row),
      snippet: row.snippet,
      rank: row.rank,
    }));

    // 应用层标签过滤
    if (tags && tags.length > 0) {
      items = items.filter((item) => tags.every((t) => item.meta.tags.includes(t)));
    }

    return {
      items,
      total: countRow.cnt,
      query,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Search failed: ${message}`);
  }
}
```

**`tools/search.ts` 工具注册：**

```typescript
// agentx-mcp/src/tools/search.ts
import { searchAssets } from '../store/search.js';
import type { AssetType } from '../types.js';

export function registerSearchTools() {
  return {
    search_assets: {
      description: 'Full-text search across all assets (skills, prompts, rules, MCPs, agents). Uses SQLite FTS5 BM25 ranking.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query. Supports FTS5 syntax: "exact phrase", term*, term1 OR term2',
          },
          types: {
            type: 'array',
            items: { type: 'string', enum: ['skill', 'prompt', 'rule', 'mcp', 'agent', 'workflow'] },
            description: 'Limit search to these asset types',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Only return assets that have ALL of these tags',
          },
          limit: { type: 'number', default: 20, description: 'Max results (1-100)' },
          offset: { type: 'number', default: 0, description: 'Pagination offset' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      handler: async (input: {
        query: string;
        types?: AssetType[];
        tags?: string[];
        limit?: number;
        offset?: number;
      }) => searchAssets(input),
    },
  };
}
```

---

## 4. 从 Claude Code 导入（中期，差异化核心）

### 4.1 `import_from_claude_code` 工具完整接口

```typescript
// 工具名：import_from_claude_code
// 文件：agentx-mcp/src/tools/import.ts

interface ImportInput {
  source_dir?: string;   // 默认 ~/.claude，可指定其他路径
  types?: Array<'skills' | 'mcps'>;  // 默认导入全部类型
  dry_run?: boolean;     // true 时只扫描不写入，默认 false
  overwrite?: boolean;   // 遇到同名资产时是否覆盖，默认 false
}

interface ImportedItem {
  type: 'skill' | 'mcp';
  name: string;
  origin_path: string;   // 原始文件绝对路径
  action: 'created' | 'skipped' | 'overwritten';
  asset_id?: string;     // 创建成功后的 UUID（dry_run 时为 undefined）
  reason?: string;       // skipped 时说明原因
}

interface ImportResult {
  dry_run: boolean;
  source_dir: string;
  scanned: {
    skills_found: number;
    mcps_found: number;
  };
  imported: ImportedItem[];
  errors: Array<{ path: string; message: string }>;
}
```

### 4.2 扫描逻辑

**Skills 扫描路径：**

```
~/.claude/plugins/*/skills/**/*.md
~/.claude/skills/**/*.md
~/.claude/commands/**/*.md   （作为 prompt 类型导入）
```

**MCP 配置扫描路径：**

```
~/.claude/settings.json       → mcpServers 字段
~/.claude/settings.local.json → mcpServers 字段（优先级更高）
```

**扫描规则：**
- Skill 文件名（去掉 `.md` 后缀）作为 `name`
- 文件第一行如果是 `# Title`，提取为 `description`
- MCP 的 `name` 取 `mcpServers` 的 key
- 同名资产（同 type + name）视为重复，`overwrite=false` 时跳过

### 4.3 `tools/import.ts` 实现设计

```typescript
// agentx-mcp/src/tools/import.ts
import { readFile, readdir, stat } from 'fs/promises';
import { join, basename, extname } from 'path';
import { homedir } from 'os';
import { glob } from 'fs/promises';  // Node 22+ 原生 glob，或用 fast-glob 包
import { createAsset, listAssets } from '../store/assets.js';
import type { AssetMeta, McpConfig } from '../types.js';

interface ImportInput {
  source_dir?: string;
  types?: Array<'skills' | 'mcps'>;
  dry_run?: boolean;
  overwrite?: boolean;
}

interface ImportedItem {
  type: 'skill' | 'mcp';
  name: string;
  origin_path: string;
  action: 'created' | 'skipped' | 'overwritten';
  asset_id?: string;
  reason?: string;
}

interface ImportResult {
  dry_run: boolean;
  source_dir: string;
  scanned: { skills_found: number; mcps_found: number };
  imported: ImportedItem[];
  errors: Array<{ path: string; message: string }>;
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findMarkdownFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    // 目录不存在时静默跳过
  }
  return results;
}

async function extractSkillMeta(filePath: string): Promise<{ name: string; description?: string; content: string }> {
  const content = await readFile(filePath, 'utf-8');
  const name = basename(filePath, '.md');
  // 提取第一行 # Title 作为 description
  const firstLine = content.split('\n')[0] ?? '';
  const description = firstLine.startsWith('# ')
    ? firstLine.slice(2).trim()
    : undefined;
  return { name, description, content };
}

async function readMcpSettings(settingsPath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    return parsed.mcpServers ?? {};
  } catch {
    return {};
  }
}

export async function importFromClaudeCode(
  input: ImportInput,
  baseDir: string
): Promise<ImportResult> {
  const sourceDir = input.source_dir ?? join(homedir(), '.claude');
  const importTypes = input.types ?? ['skills', 'mcps'];
  const dryRun = input.dry_run ?? false;
  const overwrite = input.overwrite ?? false;

  const result: ImportResult = {
    dry_run: dryRun,
    source_dir: sourceDir,
    scanned: { skills_found: 0, mcps_found: 0 },
    imported: [],
    errors: [],
  };

  // 获取现有资产用于重复检测
  const existingSkills = await listAssets('skill');
  const existingMcps = await listAssets('mcp');
  const existingSkillNames = new Set(existingSkills.map((s) => s.name));
  const existingMcpNames = new Set(existingMcps.map((m) => m.name));

  // === 导入 Skills ===
  if (importTypes.includes('skills')) {
    const skillDirs = [
      join(sourceDir, 'plugins'),
      join(sourceDir, 'skills'),
    ];

    for (const dir of skillDirs) {
      const files = await findMarkdownFiles(dir);
      result.scanned.skills_found += files.length;

      for (const filePath of files) {
        try {
          const { name, description, content } = await extractSkillMeta(filePath);
          const isDuplicate = existingSkillNames.has(name);

          if (isDuplicate && !overwrite) {
            result.imported.push({
              type: 'skill',
              name,
              origin_path: filePath,
              action: 'skipped',
              reason: `Skill "${name}" already exists. Use overwrite=true to replace.`,
            });
            continue;
          }

          if (!dryRun) {
            const meta = await createAsset(
              {
                type: 'skill',
                name,
                description,
                tags: ['imported', 'claude-code'],
                // source 字段在 types.ts 扩展后使用
              },
              content,
              baseDir
            );
            result.imported.push({
              type: 'skill',
              name,
              origin_path: filePath,
              action: isDuplicate ? 'overwritten' : 'created',
              asset_id: meta.id,
            });
          } else {
            // dry_run：只记录会发生什么
            result.imported.push({
              type: 'skill',
              name,
              origin_path: filePath,
              action: isDuplicate ? 'overwritten' : 'created',
            });
          }
        } catch (err) {
          result.errors.push({
            path: filePath,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  // === 导入 MCPs ===
  if (importTypes.includes('mcps')) {
    const settingsPaths = [
      join(sourceDir, 'settings.json'),
      join(sourceDir, 'settings.local.json'),
    ];

    // 合并两个 settings 文件，local 优先
    const mcpServers: Record<string, unknown> = {};
    for (const settingsPath of settingsPaths) {
      const servers = await readMcpSettings(settingsPath);
      Object.assign(mcpServers, servers);  // local 覆盖 global
    }

    result.scanned.mcps_found = Object.keys(mcpServers).length;

    for (const [mcpName, mcpRaw] of Object.entries(mcpServers)) {
      try {
        const raw = mcpRaw as { command: string; args?: string[]; env?: Record<string, string> };
        const config: McpConfig = {
          name: mcpName,
          command: raw.command,
          args: raw.args,
          env: raw.env,
          enabled: true,
        };

        const isDuplicate = existingMcpNames.has(mcpName);

        if (isDuplicate && !overwrite) {
          result.imported.push({
            type: 'mcp',
            name: mcpName,
            origin_path: join(sourceDir, 'settings.json'),
            action: 'skipped',
            reason: `MCP "${mcpName}" already exists.`,
          });
          continue;
        }

        if (!dryRun) {
          const yaml = await import('js-yaml');
          const content = yaml.dump(config);
          const meta = await createAsset(
            { type: 'mcp', name: mcpName, tags: ['imported', 'claude-code'] },
            content,
            baseDir
          );
          result.imported.push({
            type: 'mcp',
            name: mcpName,
            origin_path: join(sourceDir, 'settings.json'),
            action: isDuplicate ? 'overwritten' : 'created',
            asset_id: meta.id,
          });
        } else {
          result.imported.push({
            type: 'mcp',
            name: mcpName,
            origin_path: join(sourceDir, 'settings.json'),
            action: isDuplicate ? 'overwritten' : 'created',
          });
        }
      } catch (err) {
        result.errors.push({
          path: join(sourceDir, 'settings.json'),
          message: `MCP "${mcpName}": ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  return result;
}

**工具注册（在 `tools/import.ts` 末尾）：**

```typescript
export function registerImportTools(baseDir: string) {
  return {
    import_from_claude_code: {
      description: 'Scan ~/.claude (or a custom path) and import existing skills and MCP configurations into AgentX. Supports dry_run mode to preview without writing.',
      inputSchema: {
        type: 'object',
        properties: {
          source_dir: {
            type: 'string',
            description: 'Path to scan. Defaults to ~/.claude',
          },
          types: {
            type: 'array',
            items: { type: 'string', enum: ['skills', 'mcps'] },
            description: 'Which asset types to import. Defaults to both.',
          },
          dry_run: {
            type: 'boolean',
            default: false,
            description: 'If true, scan and report what would be imported without writing anything',
          },
          overwrite: {
            type: 'boolean',
            default: false,
            description: 'If true, overwrite existing assets with the same name',
          },
        },
        additionalProperties: false,
      },
      handler: async (input: ImportInput) => importFromClaudeCode(input, baseDir),
    },
  };
}
```

### 4.4 dry_run 模式行为说明

`dry_run: true` 时：
- 完整执行文件扫描和重复检测逻辑
- **不调用** `createAsset` 或 `updateAsset`
- 返回的 `ImportedItem` 中 `asset_id` 为 `undefined`
- `action` 字段仍然正确反映"如果真正执行会发生什么"（`created` / `skipped` / `overwritten`）
- 用途：让用户在执行前预览影响范围，确认无误后再去掉 `dry_run` 执行

---

## 5. 数据模型扩展

### 5.1 `AssetMeta` 扩展

当前 `AssetMeta` 缺少来源追踪字段，导入功能需要记录资产的原始来源：

```typescript
// 扩展后的 AssetMeta
export interface AssetMeta {
  id: string;
  type: AssetType;
  name: string;
  description?: string;
  tags: string[];
  file_path: string;
  created_at: number;
  updated_at: number;
  // 新增字段
  source?: 'local' | 'imported' | 'generated';  // 资产来源
  origin_path?: string;   // 导入时的原始文件路径
  origin_url?: string;    // 未来支持从 URL 导入
}
```

### 5.2 `AgentConfig` 扩展

增加 `prompts` 字段（当前只有 `rules` 和 `skills`），以及元数据字段：

```typescript
export interface AgentConfig {
  name: string;
  version: string;
  description?: string;
  role_prompt?: string;
  rules: string[];
  skills: string[];
  prompts: string[];      // 新增：prompt 资产 ID 列表
  mcps: McpConfig[];
  workflow?: string;
  // 新增元数据
  author?: string;
  created_at?: string;    // ISO 日期字符串
  tags?: string[];
}
```

### 5.3 数据库 schema 扩展

在 `store/db.ts` 的 `initDb` 中，`assets` 表需要增加两列：

```sql
-- 在 CREATE TABLE IF NOT EXISTS assets 中增加列
-- 注意：SQLite 不支持 ADD COLUMN 到 CREATE TABLE，需要用 ALTER TABLE 迁移

-- 迁移脚本（在 initDb 中执行，幂等）
ALTER TABLE assets ADD COLUMN source TEXT DEFAULT 'local';
ALTER TABLE assets ADD COLUMN origin_path TEXT;
```

**迁移策略：** 用 `try/catch` 包裹 `ALTER TABLE`，如果列已存在则忽略错误（SQLite 的 `ALTER TABLE ADD COLUMN` 在列已存在时会报错）：

```typescript
// store/db.ts 中的迁移逻辑
function runMigrations(db: Database.Database): void {
  const migrations = [
    `ALTER TABLE assets ADD COLUMN source TEXT DEFAULT 'local'`,
    `ALTER TABLE assets ADD COLUMN origin_path TEXT`,
  ];
  for (const sql of migrations) {
    try {
      db.exec(sql);
    } catch {
      // 列已存在，忽略
    }
  }
}
```

### 5.4 更新后的 `types.ts` 完整内容

```typescript
// agentx-mcp/src/types.ts — v0.2

export type AssetType = 'skill' | 'mcp' | 'prompt' | 'rule' | 'workflow' | 'agent';

export type AssetSource = 'local' | 'imported' | 'generated';

export interface AssetMeta {
  id: string;
  type: AssetType;
  name: string;
  description?: string;
  tags: string[];
  file_path: string;
  created_at: number;
  updated_at: number;
  // v0.2 新增
  source?: AssetSource;
  origin_path?: string;
  origin_url?: string;
}

export interface AgentConfig {
  name: string;
  version: string;
  description?: string;
  role_prompt?: string;
  rules: string[];
  skills: string[];
  prompts: string[];       // v0.2 新增
  mcps: McpConfig[];
  workflow?: string;
  // v0.2 新增元数据
  author?: string;
  created_at?: string;
  tags?: string[];
}

export interface McpConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

// v0.2 新增：导入结果类型
export interface ImportedItem {
  type: 'skill' | 'mcp';
  name: string;
  origin_path: string;
  action: 'created' | 'skipped' | 'overwritten';
  asset_id?: string;
  reason?: string;
}

export interface ImportResult {
  dry_run: boolean;
  source_dir: string;
  scanned: {
    skills_found: number;
    mcps_found: number;
  };
  imported: ImportedItem[];
  errors: Array<{ path: string; message: string }>;
}

// v0.2 新增：搜索结果类型
export interface SearchResultItem {
  meta: AssetMeta;
  snippet: string;
  rank: number;
}

export interface SearchResult {
  items: SearchResultItem[];
  total: number;
  query: string;
}
```

---

## 6. 成功标准

### 6.1 MVP 缺口修复（立即，预计 1-2 天）

- [ ] `update_skill({ id, content: "新内容" })` 能成功更新文件，调用后 `get_skill` 返回新内容
- [ ] `list_prompts` / `create_prompt` / `get_prompt` / `update_prompt` / `delete_prompt` 均可通过 MCP 调用
- [ ] `list_rules` / `create_rule` / `get_rule` / `update_rule` / `delete_rule` 均可通过 MCP 调用
- [ ] `list_mcps` / `create_mcp` / `get_mcp` / `update_mcp` / `delete_mcp` 均可通过 MCP 调用
- [ ] `index.ts` 注册的工具总数 ≥ 25 个（skills×5 + agents×6 + prompts×5 + rules×5 + mcps×5 + search×1 = 27）

### 6.2 Schema 完善（短期，预计 2-3 天）

- [ ] 所有工具的 `inputSchema` 均包含 `properties` 和 `required` 字段，不再是空对象
- [ ] Claude 在调用 `create_skill` 时能自动推断需要 `name` 和 `content` 参数
- [ ] Claude 在调用 `export_agent` 时能自动推断需要 `id` 和 `output_dir` 参数
- [ ] `list_skills({ tags: ["python"] })` 能正确过滤返回结果

### 6.3 全文搜索（中期，预计 3-5 天）

- [ ] `search_assets({ query: "python" })` 在 100ms 内返回结果（本地 SQLite FTS5 性能基准）
- [ ] `search_assets({ query: "python", types: ["skill"] })` 只返回 skill 类型资产
- [ ] `search_assets({ query: "nonexistent_xyz_abc" })` 返回 `{ items: [], total: 0 }` 而非报错
- [ ] `search_assets({ query: "" })` 返回空结果而非报错
- [ ] 新建资产后立即可被搜索到（FTS 同步写入，无延迟）
- [ ] 删除资产后搜索不再返回该资产

### 6.4 导入功能（中期，预计 3-5 天）

- [ ] `import_from_claude_code({ dry_run: true })` 能正确发现 `~/.claude` 下的所有 `.md` 文件，返回 `scanned.skills_found > 0`（前提：`~/.claude` 下有 skill 文件）
- [ ] `import_from_claude_code({ dry_run: true })` 不写入任何文件，调用前后 `list_skills` 结果不变
- [ ] `import_from_claude_code({ types: ["mcps"] })` 能从 `~/.claude/settings.json` 读取 `mcpServers` 并创建对应 MCP 资产
- [ ] `import_from_claude_code({ overwrite: false })` 遇到同名资产时返回 `action: "skipped"` 而非报错
- [ ] 导入的资产 `source` 字段为 `"imported"`，`origin_path` 记录原始文件路径

### 6.5 数据模型（配合上述功能）

- [ ] `AssetMeta` 包含 `source` 和 `origin_path` 字段
- [ ] `AgentConfig` 包含 `prompts` 字段
- [ ] 数据库迁移幂等：多次启动 AgentX 不报错

---

## 附录：建议实现顺序

```
Week 1（立即）:
  Day 1: 修复 update_skill content bug（30 分钟）
  Day 1: 创建 tools/prompts.ts + tools/rules.ts（2 小时，模式复制）
  Day 2: 创建 tools/mcps.ts（1 小时）
  Day 2: 更新 index.ts 注册所有工具（30 分钟）
  Day 2-3: 为所有工具补全 inputSchema（3 小时）

Week 2（中期）:
  Day 1-2: 实现 FTS5 建表 + 触发器 + store/search.ts
  Day 2-3: 实现 tools/import.ts（扫描逻辑 + dry_run）
  Day 3: 更新 types.ts + 数据库迁移
  Day 4-5: 集成测试 + 验收标准逐项验证
```

**优先级理由：**
1. Schema 修复是最高优先级，因为它直接影响 Claude 能否正确使用工具，是所有后续功能的基础
2. prompts/rules/mcps 工具注册是 MVP 完整性要求，代码量小但影响大
3. 全文搜索和导入功能是差异化竞争力，但依赖前两项完成后才能稳定集成
