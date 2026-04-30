# AgentX 配置说明

> 完整的环境变量、目录结构、数据库和配置文件说明。

---

## 📖 目录

- [1. 环境变量](#1-环境变量)
- [2. 目录结构](#2-目录结构)
- [3. 数据库 Schema](#3-数据库-schema)
- [4. 配置文件格式](#4-配置文件格式)
- [5. MCP 服务器配置](#5-mcp-服务器配置)
- [6. CLI 配置](#6-cli-配置)
- [7. 高级配置](#7-高级配置)

---

## 1. 环境变量

### AGENTX_DIR

**作用**：自定义 AgentX 数据存储目录。

**默认值**：
- **macOS/Linux**：`~/.agentx/`
- **Windows**：`%USERPROFILE%\.agentx\`

**设置方式**：

**macOS/Linux**（bash/zsh）：
```bash
# 临时设置（当前会话有效）
export AGENTX_DIR="/path/to/custom/dir"

# 永久设置（添加到 ~/.bashrc 或 ~/.zshrc）
echo 'export AGENTX_DIR="/path/to/custom/dir"' >> ~/.zshrc
source ~/.zshrc
```

**Windows**（PowerShell）：
```powershell
# 临时设置
$env:AGENTX_DIR = "D:\agentx-data"

# 永久设置（系统环境变量）
[System.Environment]::SetEnvironmentVariable("AGENTX_DIR", "D:\agentx-data", "User")
```

**验证**：
```bash
echo $AGENTX_DIR  # macOS/Linux
echo $env:AGENTX_DIR  # Windows PowerShell
```

**注意事项**：
- 更改 `AGENTX_DIR` 后，需要重新导入或迁移资产
- 数据库和所有资产文件会存储到新目录
- 确保目录有读写权限

---

### NODE_ENV

**作用**：运行环境（不影响功能，仅用于调试）。

**有效值**：
- `development` - 开发模式（更多日志）
- `production` - 生产模式（默认）

**示例**：
```bash
NODE_ENV=production agentx list
```

---

## 2. 目录结构

### 默认目录布局

```
~/.agentx/
├── db.sqlite                    # SQLite 数据库（索引）
├── skills/                      # 技能目录
│   └── {skill-id}/
│       └── skill.md             # 技能内容文件
├── prompts/                     # 提示词目录
│   └── {prompt-id}.md
├── rules/                       # 规则目录
│   └── {rule-id}.md
├── mcps/                        # MCP 配置目录
│   └── {mcp-name}.json          # MCP 配置（JSON 格式）
├── workflows/                   # 工作流目录
│   └── {workflow-id}.yaml
├── agents/                      # 智能体目录
│   └── {agent-id}/
│       ├── agent.yaml           # 智能体配置
│       └── debug/               # 调试记录（未来功能）
└── config.json                  # 全局配置（可选，当前未使用）
```

### 目录说明

#### `db.sqlite`

SQLite 数据库文件，包含两个表：

**assets 表**（资产索引）：
```sql
CREATE TABLE assets (
  id TEXT PRIMARY KEY,          -- UUID
  type TEXT NOT NULL,           -- asset type
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT DEFAULT '[]',       -- JSON array
  file_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,  -- timestamp ms
  updated_at INTEGER NOT NULL
);
```

**agent_components 表**（智能体组件关系，预留）：
```sql
CREATE TABLE agent_components (
  agent_id TEXT NOT NULL,
  component_type TEXT NOT NULL,
  component_id TEXT NOT NULL,
  order_index INTEGER DEFAULT 0
);
```

**assets_fts**（全文搜索虚拟表，自动维护）：
- 基于 `assets` 表的 FTS5 虚拟表
- 索引字段：`name`、`description`
- 通过触发器自动同步

---

#### 资产文件命名规则

| 资产类型 | 目录 | 文件名 | 示例 |
|----------|------|--------|------|
| Skill | `skills/{id}/` | `skill.md` | `~/.agentx/skills/a1b2/skill.md` |
| Prompt | `prompts/` | `{id}.md` | `~/.agentx/prompts/b2c3.md` |
| Rule | `rules/` | `{id}.md` | `~/.agentx/rules/c3d4.md` |
| MCP | `mcps/` | `{name}.json` | `~/.agentx/mcps/filesystem.json` |
| Workflow | `workflows/` | `{id}.yaml` | `~/.agentx/workflows/d4e5.yaml` |
| Agent | `agents/{id}/` | `agent.yaml` | `~/.agentx/agents/e5f6/agent.yaml` |

**命名说明**：
- Skill 使用子目录 `{id}/skill.md`（为未来扩展预留）
- Prompt、Rule、Workflow 直接使用 `{id}.md/yaml`
- MCP 使用 `{name}.json`（文件名与 MCP 名称一致）
- Agent 使用子目录 `{id}/agent.yaml`

---

### 自定义目录示例

```bash
# 设置自定义目录
export AGENTX_DIR="/data/agentx"

# 目录结构
/data/agentx/
├── db.sqlite
├── skills/
├── prompts/
└── ...
```

---

## 3. 数据库 Schema

### 表结构详解

#### assets 表（核心表）

```sql
-- 查看表结构
.schema assets

-- 查看所有记录
SELECT * FROM assets;

-- 按类型统计
SELECT type, COUNT(*) FROM assets GROUP BY type;
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | UUID，主键 |
| `type` | TEXT | 资产类型：skill/prompt/rule/mcp/workflow/agent |
| `name` | TEXT | 资产名称（用户友好） |
| `description` | TEXT | 描述（可为空） |
| `tags` | TEXT | JSON 数组字符串，如 `["dev","test"]` |
| `file_path` | TEXT | 物理文件路径（绝对路径） |
| `created_at` | INTEGER | 创建时间戳（毫秒） |
| `updated_at` | INTEGER | 最后修改时间戳（毫秒） |

**索引**：
- `idx_assets_type`：加速按类型查询
- `idx_assets_name`：加速按名称查询

---

#### agent_components 表（预留）

```sql
-- 智能体与组件的多对多关系
CREATE TABLE agent_components (
  agent_id TEXT NOT NULL,
  component_type TEXT NOT NULL,  -- 'skill' | 'rule' | 'mcp'
  component_id TEXT NOT NULL,    -- 引用的资产 ID
  order_index INTEGER DEFAULT 0 -- 排序权重
);
```

**用途**：未来支持更灵活的组件管理（当前版本直接使用 agent.yaml 引用文件路径）。

---

#### assets_fts（虚拟表，自动维护）

```sql
-- 全文搜索查询
SELECT a.*, fts.rank
FROM assets_fts fts
JOIN assets a ON a.id = fts.id
WHERE assets_fts MATCH '代码审查'
ORDER BY fts.rank;
```

**注意**：`assets_fts` 是虚拟表，不能直接插入数据，由触发器自动维护。

---

### 数据库维护命令

```bash
# 打开数据库（需安装 sqlite3 命令行工具）
sqlite3 ~/.agentx/db.sqlite

# 查看所有表
.tables

# 查看表结构
.schema assets

# 统计各类型资产数量
SELECT type, COUNT(*) as count FROM assets GROUP BY type;

# 查看最近更新的资产
SELECT name, type, updated_at FROM assets ORDER BY updated_at DESC LIMIT 10;

# 检查全文搜索索引
SELECT * FROM assets_fts LIMIT 5;

# 导出数据库（备份）
sqlite3 ~/.agentx/db.sqlite ".backup /path/to/backup.db"

# 退出
.exit
```

---

### 数据库备份与恢复

**备份**：
```bash
# 复制文件（AgentX 关闭时）
cp ~/.agentx/db.sqlite ~/backups/agentx-$(date +%Y%m%d).db

# 或使用 sqlite3 工具（在线备份）
sqlite3 ~/.agentx/db.sqlite ".backup ~/backups/agentx.db"
```

**恢复**：
```bash
# 停止 AgentX（关闭 Claude Code 或 CLI）
# 替换数据库文件
cp ~/backups/agentx.db ~/.agentx/db.sqlite
```

**注意**：
- 备份时确保 AgentX 未运行，避免数据不一致
- 资产文件（`skills/`、`prompts/` 等）需单独备份

---

## 4. 配置文件格式

### MCP 配置文件（JSON）

**位置**：`~/.agentx/mcps/{name}.json`

**示例**：`filesystem.json`
```json
{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"],
  "env": {
    "ALLOWED_PATHS": "/Users/alice/projects"
  },
  "enabled": true
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | MCP 名称（唯一） |
| `command` | string | ✅ | 启动命令 |
| `args` | array | ❌ | 命令行参数 |
| `env` | object | ❌ | 环境变量映射 |
| `enabled` | boolean | ✅ | 是否启用 |

**env 变量支持**：
- 可直接写入值：`"API_KEY": "abc123"`
- 使用占位符（从系统环境变量读取）：`"API_KEY": "${API_KEY}"`

---

### Agent 配置文件（YAML）

**位置**：`~/.agentx/agents/{agent-id}/agent.yaml`

**完整示例**：
```yaml
name: "全栈开发助手"
version: "1.0.0"
description: "帮助全栈开发的 AI 助手"

# 角色提示词（支持文件路径或内联）
role_prompt: |
  你是有 10 年经验的全栈工程师，精通：
  - 前端：React、Vue
  - 后端：Node.js、Python

  工作原则：
  1. 代码简洁、可维护
  2. 安全性优先

# 规则列表（文件路径，相对 ~/.agentx/）
rules:
  - rules/no-sensitive-data.md
  - rules/always-chinese.md

# 技能列表
skills:
  - skills/code-review.md
  - skills/refactoring.md

# MCP 配置
mcps:
  - name: filesystem
    enabled: true
  - name: github
    enabled: true
    config:
      token: "${GITHUB_TOKEN}"

# 工作流（可选）
workflow: workflows/code-review-flow.yaml

# 标签（可选）
tags:
  - "fullstack"
  - "review"
```

**YAML 格式说明**：
- 使用缩进表示层级（2 空格）
- 字符串支持 `|`（保留换行）和 `>`（折叠换行）
- 数组使用 `-` 列表符号

---

### Skill/Prompt/Rule 文件（Markdown）

**格式**：标准 Markdown

**示例**：`code-review.md`
```markdown
# 代码审查

## 职责
- 检查代码质量
- 发现潜在 bug

## 检查清单
- [ ] 变量命名清晰
- [ ] 无硬编码密码

## 输出格式
1. 总体评价
2. 发现的问题
3. 改进建议
```

**支持的特性**：
- 标题（`#`、`##`、`###`）
- 列表（有序、无序、任务列表）
- 代码块（```language）
- 粗体/斜体
- 表格

---

### Workflow 文件（YAML）

**位置**：`~/.agentx/workflows/{id}.yaml`

**示例**：
```yaml
name: "代码审查流程"
description: "完整的代码审查工作流"

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

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 工作流名称 |
| `description` | string | 描述 |
| `steps` | array | 步骤列表 |
| `steps[].id` | string | 步骤 ID（唯一） |
| `steps[].type` | string | 类型：`skill` / `rule` / `condition` |
| `steps[].skill` | string | 技能名称（type=skill 时） |
| `steps[].next` | string | 下一步 ID（串行） |

**注意**：工作流引擎当前版本未实现，配置文件已预留。

---

## 5. MCP 服务器配置

### Claude Code 集成配置

**配置文件位置**：

| 平台 | 路径 |
|------|------|
| macOS | `~/.claude.json` |
| Linux | `~/.claude.json` |
| Windows | `%USERPROFILE%\.claude.json` |

**配置格式**：
```json
{
  "mcpServers": {
    "agentx": {
      "command": "agentx-mcp",
      "args": []
    }
  }
}
```

**配置选项**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `command` | string | 可执行文件路径或命令名 |
| `args` | array | 命令行参数数组 |
| `env` | object | 环境变量（可选） |
| `cwd` | string | 工作目录（可选） |

---

### 配置示例

**示例 1：全局安装**
```json
{
  "mcpServers": {
    "agentx": {
      "command": "agentx-mcp"
    }
  }
}
```

**示例 2：本地开发**
```json
{
  "mcpServers": {
    "agentx": {
      "command": "node",
      "args": ["/path/to/agentx-mcp/dist/index.js"]
    }
  }
}
```

**示例 3：带环境变量**
```json
{
  "mcpServers": {
    "agentx": {
      "command": "agentx-mcp",
      "args": [],
      "env": {
        "AGENTX_DIR": "/custom/agentx/dir",
        "NODE_ENV": "production"
      }
    }
  }
}
```

---

### 多服务器配置

可以同时配置多个 MCP 服务器：
```json
{
  "mcpServers": {
    "agentx": {
      "command": "agentx-mcp"
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

---

### 配置验证

验证配置文件格式正确：
```bash
# macOS/Linux
cat ~/.claude.json | python3 -m json.tool

# Windows PowerShell
Get-Content $env:USERPROFILE\.claude.json | ConvertFrom-Json
```

**常见错误**：
- 缺少逗号
- 引号不匹配
- 末尾多余逗号（JSON 不允许）
- 使用 `//` 注释（JSON 不支持）

**使用在线工具验证**：
- [JSONLint](https://jsonlint.com)
- [JSON Formatter](https://jsonformatter.org)

---

## 6. CLI 配置

### 命令帮助

查看所有命令：
```bash
agentx --help
```

查看具体命令帮助：
```bash
agentx list --help
agentx export --help
agentx import --help
```

---

### 全局选项

**当前版本无全局选项**，所有选项按命令绑定。

---

### 命令别名（Shell 别名）

推荐在 shell 配置中添加别名：

**bash**（`~/.bashrc`）：
```bash
alias ax='agentx'
alias axl='agentx list'
alias axs='agentx search'
```

**zsh**（`~/.zshrc`）：
```zsh
alias ax='agentx'
alias axl='agentx list'
alias axs='agentx search'
```

**PowerShell**（`$PROFILE`）：
```powershell
function ax { agentx @args }
function axl { agentx list @args }
function axs { agentx search @args }
```

---

### 输出格式

CLI 默认输出格式：

**列表命令**（`list`）：
```
ID         Name               Tags                    Updated
---------- ------------------ -----------------------  --------
a1b2c3d4   code-review        dev,review              2h ago
```

**信息命令**（`info`）：
```
AgentX Asset Library (/Users/alice/.agentx)
skills:     5
...
```

**搜索命令**（`search`）：
```
Found 2 results:
  [0.85] code-review (skill) — 专业的代码审查助手
```

**未来计划**：支持 `--format json` 输出 JSON 格式（v1.1.0）。

---

## 7. 高级配置

### 符号链接（Symlink）共享

多个项目共享同一资产库：

```bash
# 主资产库
mkdir -p /data/agentx-main

# 项目 A 使用主库
ln -s /data/agentx-main ~/.agentx

# 项目 B 使用主库（不同目录，相同数据）
ln -s /data/agentx-main /path/to/project-b/.agentx
```

**注意**：符号链接可能导致路径问题，建议使用 `AGENTX_DIR` 环境变量。

---

### 多配置文件管理

通过脚本切换不同配置：

**场景**：工作 vs 个人项目使用不同资产库。

```bash
# ~/bin/agentx-work
#!/bin/bash
export AGENTX_DIR="/data/agentx-work"
exec agentx "$@"

# ~/bin/agentx-personal
#!/bin/bash
export AGENTX_DIR="/data/agentx-personal"
exec agentx "$@"
```

使用：
```bash
agentx-work list
agentx-personal list
```

---

### 数据库性能调优

**SQLite 配置**（当前使用默认设置）：

如需调整，修改 `src/store/dts` 中的 `Database` 初始化：

```typescript
db = new Database(dbPath, {
  verbose: console.log,      // 启用 SQL 日志
  timeout: 5000,             // 超时（毫秒）
  cacheSize: -10240,         // 缓存 10MB（负数为 KB）
  journal_mode: 'WAL',       // WAL 模式（并发写入）
});
```

**WAL 模式优势**：
- 读写不互斥
- 更快的并发性能
- 自动 checkpoint

**启用 WAL**：
```sql
-- 在 initDb 中添加
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
```

---

### 资产文件权限

**安全建议**：
```bash
# 限制目录访问权限（仅自己可读写）
chmod 700 ~/.agentx
chmod 600 ~/.agentx/db.sqlite

# Windows（仅管理员可访问）
icacls "%USERPROFILE%\.agentx" /inheritance:r
icacls "%USERPROFILE%\.agentx" /grant:r "%USERNAME%:F"
```

---

### 网络代理配置

如果使用代理访问外部 MCP 服务（如 GitHub）：

```bash
# 设置 HTTP 代理
export HTTP_PROXY="http://proxy.example.com:8080"
export HTTPS_PROXY="http://proxy.example.com:8080"

# MCP 配置中也可设置
# 某些 MCP 服务器支持 proxy 配置项
```

---

## 📝 配置检查清单

安装后验证配置：

- [ ] `agentx --version` 显示版本号
- [ ] `agentx info` 显示数据库路径
- [ ] `~/.agentx/` 目录存在且可读写
- [ ] `db.sqlite` 文件存在
- [ ] Claude Code 配置文件正确
- [ ] MCP 服务器在 Claude Code 中可见

---

*文档版本：1.0.0 | 最后更新：2026-04-29*
