# AgentX 用户指南

> 从入门到精通：5 分钟快速上手，掌握智能体工厂的全部能力。

---

## 📚 目录

- [1. 5 分钟快速入门](#1-5-分钟快速入门)
  - [场景：创建代码审查助手](#场景创建代码审查助手)
  - [完整流程](#完整流程)
- [2. CLI 命令详解](#2-cli-命令详解)
  - [`agentx list`](#agentx-list)
  - [`agentx search`](#agentx-search)
  - [`agentx info`](#agentx-info)
  - [`agentx get`](#agentx-get)
  - [`agentx delete`](#agentx-delete)
  - [`agentx create`](#agentx-create)
  - [`agentx export`](#agentx-export)
  - [`agentx import`](#agentx-import)
- [3. MCP 服务器集成](#3-mcp-服务器集成)
  - [Claude Code 集成](#claude-code-集成)
  - [Claude Desktop 集成](#claude-desktop-集成)
  - [其他 MCP 客户端](#其他-mcp-客户端)
- [4. 资产类型详解](#4-资产类型详解)
  - [Skill（技能）](#skill技能)
  - [Prompt（提示词）](#prompt提示词)
  - [Rule（规则）](#rule规则)
  - [MCP（工具配置）](#mcp工具配置)
  - [Workflow（工作流）](#workflow工作流)
  - [Agent（智能体）](#agent智能体)
- [5. 导出与分享](#5-导出与分享)
  - [导出为 Claude Code 格式](#导出为-claude-code-格式)
  - [ZIP 压缩包分享](#zip-压缩包分享)
  - [Git 版本控制](#git-版本控制)
- [6. 实际使用场景](#6-实际使用场景)
  - [场景 1：个人代码助手](#场景-1个人代码助手)
  - [场景 2：技术写作助手](#场景-2技术写作助手)
  - [场景 3：数据分析助手](#场景-3数据分析助手)

---

## 1. 5 分钟快速入门

### 场景：创建代码审查助手

假设您需要一个智能体来帮助您审查代码质量、发现潜在 Bug、建议性能优化。

### 完整流程

#### 步骤 1：安装 AgentX

```bash
# 使用 npm 全局安装
npm install -g agentx-mcp

# 验证安装
agentx --version
# 输出: 1.0.0
```

#### 步骤 2：创建第一个 Skill（技能）

当前版本中，创建资产需要通过 **MCP 服务器**（Claude Code）进行。确保已安装 Claude Code 并配置了 AgentX MCP 服务器。

在 Claude Code 中，使用以下对话创建技能：

```
用户：请帮我创建一个名为 "code-review" 的技能，用于代码审查

Claude：（调用 create_skill 工具）
```

**交互输入**（Claude Code 会询问）：
```
? Name: code-review
? Description (optional): 专业的代码审查助手，检查代码质量、安全性和性能
? Tags (comma-separated, optional): dev,review,quality
? Content (opens editor):
```

在打开的编辑器中输入以下内容并保存：

````markdown
# 代码审查技能

## 职责
- 检查代码质量和可读性
- 发现潜在的逻辑错误和 Bug
- 识别安全漏洞（硬编码密码、SQL 注入等）
- 建议性能优化方案

## 检查清单

### 代码风格
- [ ] 变量/函数命名清晰、符合规范
- [ ] 适当的注释（复杂逻辑、算法）
- [ ] 一致的缩进和格式

### 安全性
- [ ] 无硬编码的敏感信息（密码、密钥、API Token）
- [ ] 输入验证充分
- [ ] 无 SQL 注入风险
- [ ] 错误信息不泄露系统细节

### 性能
- [ ] 避免 N+1 查询
- [ ] 合理使用缓存
- [ ] 循环中无阻塞操作
- [ ] 内存使用合理

### 可维护性
- [ ] 函数单一职责
- [ ] 适当的抽象层次
- [ ] 无重复代码
- [ ] 单元测试覆盖关键路径

## 输出格式
1. **总体评价**：优秀/良好/需改进
2. **发现的问题**：按严重程度排序（严重 > 警告 > 建议）
3. **改进建议**：具体、可操作的修改方案
4. **正面反馈**：代码中的亮点
````

**完成**：技能已保存到 `~/.agentx/skills/`，并在数据库中建立索引。现在可以通过 Claude Code 的 `list_skills` 工具查看。

#### 步骤 3：创建 Rule（规则）

在 Claude Code 中继续：

```
用户：请帮我创建一个名为 "no-sensitive-output" 的规则，要求禁止输出敏感数据

Claude：（调用 create_rule 工具）
```

**交互输入**：
```
? Name: no-sensitive-output
? Description (optional): 禁止输出敏感数据
? Tags (comma-separated, optional): security,compliance
? Content (opens editor):
```

编辑器中输入：

```markdown
# 禁止输出敏感数据

## 规则说明
在任何情况下，智能体都**不得**输出以下内容：
- 密码、密钥、Token
- 个人信息（身份证号、手机号、邮箱）
- 内部网络配置
- 数据库连接字符串

## 处理方式
如果用户请求或代码中包含敏感信息：
1. 明确拒绝输出
2. 解释原因
3. 提供脱敏后的替代方案

## 示例
❌ **禁止**：
```
密码：abc123
API Key: sk-xxx
```

✅ **允许**：
```
[已隐藏] 密码已脱敏
[已隐藏] API Key 已脱敏
```
```

#### 步骤 4：创建 Prompt（提示词，可选）

在 Claude Code 中：

```
用户：请帮我创建一个名为 "code-expert" 的提示词，定义代码专家的角色

Claude：（调用 create_prompt 工具）
```

```
? Name: code-expert
? Description: 代码专家的角色设定
? Tags: role,expert
? Content:
```

```markdown
# 代码专家角色

你是经验丰富的软件工程师，具备以下能力：

## 专业领域
- 软件架构设计
- 代码审查与重构
- 性能优化
- 安全最佳实践

## 沟通风格
- 清晰、简洁、专业
- 提供具体代码示例
- 解释"为什么"，不只是"怎么做"

## 工作方式
1. 先理解需求和上下文
2. 分析问题的根本原因
3. 提供多种解决方案（如有）
4. 说明每种方案的优缺点
5. 给出明确建议

## 禁止行为
- 不要输出未经验证的建议
- 不要推荐不安全的做法
- 不要忽略边界情况
```

#### 步骤 5：创建 Agent（智能体）

在 Claude Code 中：

```
用户：请帮我创建一个名为 "my-code-assistant" 的智能体，包含以下组件：
  - Role Prompt: code-expert
  - Rules: no-sensitive-output
  - Skills: code-review
  - MCPs: filesystem

Claude：（调用 create_agent 工具）
```

**交互输入**：
```
? Name: my-code-assistant
? Description: 我的个人代码审查助手
? Role Prompt: code-expert
? Rules: no-sensitive-output
? Skills: code-review
? MCPs: filesystem
? Workflow: (留空)
```

**系统输出**：
```
✅ Created agent: my-code-assistant
   ID: 3f4e5d6c-7b8a-9c1d-2e3f-4a5b6c7d8e9f
   File: /Users/alice/.agentx/agents/3f4e5d6c-7b8a-9c1d-2e3f-4a5b6c7d8e9f/agent.yaml
```

#### 步骤 6：验证创建结果（使用 CLI）

```bash
# 查看所有智能体
agentx list agent

# 查看智能体详情（通过ID）
agentx get 3f4e5d6c-7b8a-9c1d-2e3f-4a5b6c7d8e9f

# 查看资产统计
agentx info
```

#### 步骤 7：导出为 Claude Code 格式

```bash
# 导出到当前目录
agentx export 3f4e5d6c-7b8a-9c1d-2e3f-4a5b6c7d8e9f -o .

# 查看生成的文件
ls -la CLAUDE.md settings.json
```

**生成的文件**：

`CLAUDE.md`：
```markdown
# my-code-assistant

专业的代码审查助手

## Role

（此处插入 prompts/code-expert 的内容）

## Rules

- no-sensitive-output: 禁止输出敏感数据

## Skills

- code-review: 代码审查技能
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

#### 步骤 8：在 Claude Code 中使用

1. 将 `CLAUDE.md` 和 `settings.json` 复制到您的项目根目录
2. 在 Claude Code 中打开项目
3. 智能体自动生效，开始使用！

---

## 2. CLI 命令详解

### `agentx list`

列出所有资产，支持按类型过滤。

**语法**：
```bash
agentx list [type]
```

**参数**：
- `type`（可选）：资产类型，可选值：`skill`、`prompt`、`rule`、`mcp`、`workflow`、`agent`

**示例**：
```bash
# 列出所有资产
agentx list

# 仅列出技能
agentx list skill

# 仅列出规则
agentx list rule
```

**输出格式**：
```
ID         Name               Tags                    Updated
---------- ------------------ -----------------------  --------
a1b2c3d4   code-review        dev,review              2h ago
e5f6g7h8   no-sensitive-data  security                1d ago
```

**列说明**：
- `ID`：资产唯一标识（前 8 位）
- `Name`：资产名称
- `Tags`：标签列表（逗号分隔）
- `Updated`：最后更新时间（相对时间）

---

### `agentx search`

全文搜索资产。

**语法**：
```bash
agentx search <query> [options]
```

**参数**：
- `query`：搜索关键词（必填）
- `--limit, -l`：最大结果数（默认：10）

**示例**：
```bash
# 基本搜索
agentx search "代码审查"

# 限制结果数量
agentx search "security" --limit 5

# 搜索英文关键词
agentx search "performance"
```

**输出格式**：
```
Found 2 results:
  [0.85] code-review (skill) — 专业的代码审查助手
  [0.72] review-guidelines (rule) — 代码审查准则
```

**搜索范围**：资产名称、描述、内容（全文检索）

---

### `agentx info`

显示资产库统计信息。

**语法**：
```bash
agentx info
```

**示例**：
```bash
$ agentx info
AgentX Asset Library (/Users/alice/.agentx)
skills:     5
prompts:    3
rules:      4
mcps:       2
workflows:  1
agents:     2
────────────────────
total:      17
db:          /Users/alice/.agentx/db.sqlite (156 KB)
```

**信息说明**：
- 各类型资产数量
- 资产总数
- 数据库路径和大小

---

### `agentx get`

显示资产详情和内容。

**语法**：
```bash
agentx get <id> [options]
```

**参数**：
- `id`：资产 ID（必填）
- `--no-content`：不显示文件内容（默认显示）

**示例**：
```bash
# 查看资产详情 + 内容
agentx get a1b2c3d4

# 仅查看元数据（不显示内容）
agentx get a1b2c3d4 --no-content
```

**输出示例**：
```
ID:          a1b2c3d4-...
Name:        code-review
Type:        skill
Tags:        dev, review
Description: 专业的代码审查助手
File:        /Users/alice/.agentx/skills/a1b2c3d4/skill.md
Created:     2026-04-29 10:00:00
Updated:     2026-04-29 14:30:00

────────────────────────────────────
# 代码审查技能

## 职责
- 检查代码质量...
...
```

---

### `agentx delete`

删除资产。

**语法**：
```bash
agentx delete <id> [options]
```

**参数**：
- `id`：资产 ID（必填）
- `-y, --yes`：跳过确认提示

**示例**：
```bash
# 删除前会询问确认
agentx delete a1b2c3d4
# 提示：Delete skill "code-review"? This cannot be undone. (Y/n)

# 跳过确认直接删除
agentx delete a1b2c3d4 --yes
# 输出：Deleted: code-review (a1b2c3d4)
```

**注意事项**：
- 删除操作不可恢复
- 同时删除数据库记录和物理文件
- 如果资产被智能体引用，删除后智能体会失效（需更新）

---

### 创建资产

**当前 CLI 暂不支持创建资产**。创建新资产需通过 **MCP 服务器**（Claude Code）调用以下工具：

- `create_skill` - 创建技能
- `create_prompt` - 创建提示词
- `create_rule` - 创建规则
- `create_mcp` - 创建 MCP 配置
- `create_workflow` - 创建工作流
- `create_agent` - 创建智能体

在 Claude Code 中直接向 AI 说明需求即可，例如：
```
用户：帮我创建一个名为 "my-skill" 的技能，内容是...
```

资产创建后，可通过 CLI 的 `list`、`get`、`search` 等命令查看和管理。

---

### `agentx create`（规划中）

交互式创建新资产功能正在开发中，敬请期待。

---

### `agentx export`

导出智能体为 Claude Code 可用格式（CLAUDE.md + settings.json）。

**语法**：
```bash
agentx export <id> [options]
```

**参数**：
- `id`：智能体 ID 或名称（必填）
- `-o, --output <dir>`：输出目录（默认：当前目录）

**注意**：export 命令仅支持 `agent` 类型资产。如需导出其他类型，请使用 `agentx get <id> --content` 查看内容后手动复制。

**示例**：
```bash
# 导出到当前目录
agentx export 3f4e5d6c-7b8a-9c1d-2e3f-4a5b6c7d8e9f

# 导出到指定目录
agentx export my-agent-id -o ./my-assistant
```

**输出文件**：
```
输出目录/
├── CLAUDE.md      # 智能体说明文档
└── settings.json  # MCP 服务器配置
```

**使用步骤**：
1. 运行导出命令
2. 将两个文件复制到您的项目根目录
3. 在 Claude Code 中打开项目即可使用

---

### `agentx import`

从 Claude Code 的本地资产目录导入资产。

**语法**：
```bash
agentx import <type> [options]
```

**参数**：
- `type`：资产类型（必填）：`skill`、`prompt`、`rule`
- `-s, --source <dir>`：源目录（默认：Claude Code 默认资产目录）
- `-t, --tags <tags>`：导入后添加的标签，逗号分隔（默认：`imported,claude`）

**示例**：
```bash
# 导入技能（从默认目录）
agentx import skill

# 指定源目录
agentx import prompt --source ~/my-prompts

# 自定义标签
agentx import rule --tags "security,custom"
```

**导入逻辑**：
- 扫描源目录中所有 `.md` 文件
- 提取文件名作为资产名称
- 文件内容作为资产内容
- 自动去重（同名资产不会重复导入）
- 返回导入数量和跳过数量

---

## 3. MCP 服务器集成

AgentX 可作为 MCP 服务器运行，供 Claude Code 或其他 MCP 客户端调用。

### Claude Code 集成

#### 配置步骤

**1. 编辑 MCP 配置文件**

**macOS**：
```bash
code ~/.claude.json
```

**Linux**：
```bash
nano ~/.claude.json
```

**Windows**（PowerShell）：
```powershell
notepad $env:USERPROFILE\.claude.json
```

**2. 添加 AgentX 服务器配置**

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

**配置说明**：

| 字段 | 说明 |
|------|------|
| `command` | 可执行文件，可以是：<br>• `agentx-mcp`（全局安装）<br>• `node` + `args`（本地路径） |
| `args` | 命令行参数数组，如使用 `node` 方式：<br>`["/path/to/dist/index.js"]` |

**3. 重启 Claude Code**

完全退出 Claude Code 并重新启动，使配置生效。

**4. 验证集成**

在 Claude Code 聊天中输入：
```
使用 agentx 列出所有的技能
```

Claude 应该调用 `list_skills` 工具并返回结果。

---

#### 本地开发配置

如果您在本地开发，未全局安装，可以使用以下配置：

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

**示例**（Windows）：
```json
{
  "mcpServers": {
    "agentx": {
      "command": "node",
      "args": ["D:/xiaoyue/mcps/agentX/agentx-mcp/dist/index.js"]
    }
  }
}
```

---

### Claude Desktop 集成

Claude Desktop 的配置方式相同，配置文件位置：

**macOS**：`~/Library/Application Support/Claude/claude.json`
**Windows**：`%APPDATA%\Claude\claude.json`

配置内容与 Claude Code 一致。

---

### 其他 MCP 客户端

任何支持 MCP 协议的客户端都可以集成 AgentX：

**配置模板**：
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

**常见客户端**：
- Claude Desktop
- Claude Code
- Cursor（部分支持）
- Windsurf
- 任何自定义 MCP 客户端

---

## 4. 资产类型详解

### Skill（技能）

**用途**：可调用的能力单元，定义智能体可以执行的具体任务。

**文件格式**：Markdown (`.md`)

**存储路径**：`~/.agentx/skills/{id}/skill.md`

**示例结构**：
```markdown
# 技能名称

## 职责
- 具体职责描述
- 能力范围

## 使用方式
何时调用此技能

## 输入/输出
- 输入：需要什么信息
- 输出：返回什么结果

## 注意事项
- 限制条件
- 边界情况
```

**实际案例**：代码审查、写作润色、数据分析、文档生成

---

### Prompt（提示词）

**用途**：角色设定或任务模板，定义智能体的"人设"和行为模式。

**文件格式**：Markdown (`.md`)

**存储路径**：`~/.agentx/prompts/{id}.md`

**示例结构**：
```markdown
# 角色名称

## 背景
专业背景、经验年限

## 能力
- 专业技能 1
- 专业技能 2

## 沟通风格
- 语气（正式/友好/简洁）
- 语言偏好
- 回答格式

## 工作流程
1. 第一步
2. 第二步
3. 第三步

## 限制
- 不做的事情
- 需要澄清的情况
```

**与 Skill 的区别**：
- **Prompt** 定义"你是谁"（角色、风格）
- **Skill** 定义"你能做什么"（具体能力）

---

### Rule（规则）

**用途**：约束与行为准则，强制智能体遵守的规范。

**文件格式**：Markdown (`.md`)

**存储路径**：`~/.agentx/rules/{id}.md`

**示例结构**：
```markdown
# 规则名称

## 规则内容
必须遵守的具体条款

## 原因
为什么需要此规则

## 违反处理
违反时的处理方式

## 示例
✅ 正确做法
❌ 错误做法
```

**常见规则类型**：
- **安全规则**：禁止输出敏感信息
- **语言规则**：始终使用中文回答
- **格式规则**：代码必须包含注释
- **质量规则**：每个建议需提供理由

---

### MCP（工具配置）

**用途**：外部工具连接器，赋予智能体访问外部系统的能力。

**文件格式**：JSON

**存储路径**：`~/.agentx/mcps/{name}.json`

**配置结构**：
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
- `name`：MCP 名称（唯一标识）
- `command`：启动命令
- `args`：命令行参数
- `env`：环境变量
- `enabled`：是否启用（可在运行时切换）

**常用 MCP**：
- `filesystem`：文件系统访问
- `github`：GitHub API
- `database`：数据库查询
- `browser`：浏览器自动化

---

### Workflow（工作流）

**用途**：多步骤编排逻辑，定义复杂的执行流程。

**文件格式**：YAML

**存储路径**：`~/.agentx/workflows/{id}.yaml`

**示例结构**：
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

**流程控制**：
- 顺序执行
- 条件分支
- 并行执行（未来支持）

---

### Agent（智能体）

**用途**：积木的组合体，完整定义的 AI 助手。

**文件格式**：YAML

**存储路径**：`~/.agentx/agents/{id}/agent.yaml`

**完整示例**：
```yaml
name: "全栈开发助手"
version: "1.0.0"
description: "帮助全栈开发的 AI 助手，涵盖前端、后端、数据库"

# 角色提示词（引用或内联）
role_prompt: |
  你是有 10 年经验的全栈工程师，精通：
  - 前端：React、Vue、TypeScript
  - 后端：Node.js、Python、Go
  - 数据库：PostgreSQL、MongoDB

  工作原则：
  1. 代码简洁、可维护
  2. 安全性优先
  3. 性能考虑周全

# 规则列表（引用规则 ID 或名称）
rules:
  - rules/no-sensitive-data.md
  - rules/always-chinese.md

# 技能列表
skills:
  - skills/frontend-review.md
  - skills/backend-review.md
  - skills/database-design.md

# MCP 配置
mcps:
  - name: filesystem
    enabled: true
  - name: github
    enabled: true
    config:
      token: "${GITHUB_TOKEN}"

# 工作流（可选）
workflow: workflows/fullstack-review.yaml

# 元数据
tags: ["fullstack", "review", "senior"]
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 智能体名称 |
| `version` | string | ✅ | 版本号（语义化版本） |
| `description` | string | ❌ | 描述 |
| `role_prompt` | string | ✅ | 角色提示词（文件路径或内联） |
| `rules` | array | ❌ | 规则列表 |
| `skills` | array | ✅ | 技能列表 |
| `mcps` | array | ❌ | MCP 配置列表 |
| `workflow` | string | ❌ | 工作流文件路径 |
| `tags` | array | ❌ | 标签 |

---

## 5. 导出与分享

### 导出为 Claude Code 格式

将智能体导出为 Claude Code 可直接使用的格式。

**导出内容**：
- `CLAUDE.md`：智能体说明文档（包含角色、规则、技能）
- `settings.json`：MCP 服务器配置（启用的 MCP 列表）

**导出命令**：
```bash
agentx export <agent-id> -o <output-dir>
```

**完整示例**：
```bash
# 1. 先查看智能体 ID
agentx list agent

# 2. 导出
agentx export 3f4e5d6c-7b8a-9c1d-2e3f-4a5b6c7d8e9f -o ./my-assistant

# 3. 查看生成的文件
cat ./my-assistant/CLAUDE.md
cat ./my-assistant/settings.json
```

**使用导出文件**：
1. 将 `CLAUDE.md` 和 `settings.json` 复制到您的项目根目录
2. 在 Claude Code 中打开该项目
3. 智能体自动生效

**注意事项**：
- `CLAUDE.md` 中的内容会覆盖项目原有的 `CLAUDE.md`（如有）
- `settings.json` 中的 MCP 配置会与原有配置合并
- 建议在独立目录中测试后再合并

---

### ZIP 压缩包分享

AgentX 还支持 ZIP 格式导出（实验性功能）。

**导出命令**：
```bash
# 通过 MCP 工具调用（Claude Code 中）
export_agent(agent_id="xxx", output_dir="/tmp", format="zip")

# CLI 暂不支持 ZIP 格式（可通过 MCP 服务器使用）
```

**生成文件**：
```
my-assistant.agentx.zip
├── CLAUDE.md
└── settings.json
```

**分享方式**：
1. 发送 ZIP 文件给他人
2. 接收者解压
3. 复制文件到项目目录

---

### Git 版本控制

由于 AgentX 的资产以独立文件存储，天然支持 Git 版本控制。

**推荐做法**：

1. **将资产目录加入 Git**：
```bash
cd ~/.agentx
git init
git add .
git commit -m "Initial commit: my agent assets"
```

2. **使用 Git 子模块（团队共享）**：
```bash
# 创建 Git 仓库存储资产
git remote add origin <your-repo-url>
git push -u origin main

# 团队成员克隆
git clone <your-repo-url> ~/.agentx
```

3. **选择性同步**：
```bash
# 仅推送特定资产类型
git add skills/ prompts/
git commit -m "Add new skills and prompts"
git push
```

**优势**：
- 完整的历史记录
- 分支管理（尝试不同智能体配置）
- 团队共享（通过 Git 仓库）

---

## 6. 实际使用场景

### 场景 1：个人代码助手

**目标**：构建一个全能的个人编程助手。

**资产组合**：
- **Role Prompt**：全栈工程师角色
- **Rules**：安全规则、中文输出规则、代码注释规则
- **Skills**：代码审查、重构建议、性能优化、文档生成
- **MCPs**：filesystem（访问本地代码）、github（操作仓库）

**创建步骤**：
1. 创建各个 Skill 和 Rule
2. 创建 Prompt 定义角色
3. 创建 Agent 组合所有积木
4. 导出到工作目录
5. 在 Claude Code 中使用

**使用效果**：
在 Claude Code 中，智能体可以：
- 审查代码并给出具体建议
- 自动生成文档
- 协助 Git 操作
- 解答技术问题（基于您的技能库）

---

### 场景 2：技术写作助手

**目标**：构建专注于技术文档撰写的助手。

**资产组合**：
- **Role Prompt**：技术作家角色
- **Rules**：格式规范、术语统一、避免歧义
- **Skills**：文档结构规划、术语检查、可读性优化
- **MCPs**：filesystem（读取源码注释）

**创建步骤**：
1. 创建写作相关 Skill
2. 创建格式规则
3. 创建 Agent 并配置
4. 导出使用

**使用效果**：
- 审查技术文档结构
- 检查术语一致性
- 优化句子可读性
- 生成 API 文档草稿

---

### 场景 3：数据分析助手

**目标**：构建数据分析专家助手。

**资产组合**：
- **Role Prompt**：数据科学家角色
- **Rules**：统计显著性、可视化最佳实践
- **Skills**：数据清洗、统计分析、可视化建议
- **MCPs**：database（查询数据库）、filesystem（读取 CSV）

**创建步骤**：
1. 创建数据分析 Skill
2. 创建统计规则
3. 配置数据库 MCP
4. 创建 Agent
5. 导出使用

**使用效果**：
- 分析 CSV/数据库数据
- 推荐合适的统计方法
- 设计可视化图表
- 解释分析结果

---

## 📝 进阶技巧

### 技巧 1：使用标签分类

为资产添加标签，便于管理和筛选：

```bash
# 通过 MCP 创建时添加标签（在 Claude Code 中）
# 用户：请帮我创建一个技能，标签为 frontend,react,hooks

# 按标签筛选（CLI）
agentx list skill --tags frontend
```

**推荐标签体系**：
- `frontend` / `backend` / `devops`（技术栈）
- `beginner` / `advanced` / `expert`（难度）
- `review` / `debug` / `optimize`（用途）
- `security` / `performance` / `quality`（关注点）

---

### 技巧 2：资产复用

通过引用 ID 实现资产复用：

```yaml
# agent.yaml
rules:
  - rules/no-sensitive-data.md    # 安全规则（多个智能体共享）
  - rules/always-chinese.md       # 语言规则

skills:
  - skills/code-review.md         # 代码审查
  - skills/refactoring.md         # 重构建议（多个智能体共享）
```

**优势**：
- 一处修改，全局生效
- 保持一致性
- 减少重复

---

### 技巧 3：环境变量配置

MCP 配置支持环境变量：

```json
{
  "name": "github",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_TOKEN": "${GITHUB_TOKEN}",
    "GITHUB_API_URL": "https://api.github.com"
  },
  "enabled": true
}
```

**使用方式**：
```bash
# 设置环境变量
export GITHUB_TOKEN="ghp_xxx"

# 或在 Claude Code 配置中直接写入
```

---

### 技巧 4：版本管理智能体

使用 Git 管理智能体配置：

```bash
# 在资产目录初始化 Git
cd ~/.agentx
git init

# 每次重大修改前提交
git add agents/my-agent/
git commit -m "Update agent: add new skill"

# 查看历史
git log --oneline -- agents/my-agent/

# 回滚到某个版本
git checkout abc123 -- agents/my-agent/
```

---

## 📖 进阶文档

- **API 参考**：[API_REFERENCE.md](./API_REFERENCE.md) - 所有 MCP 工具的详细说明
- **配置说明**：[CONFIGURATION.md](./CONFIGURATION.md) - 环境变量、目录结构
- **故障排除**：[TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - 常见问题和解决方案
- **架构设计**：[ARCHITECTURE.md](./ARCHITECTURE.md) - 系统架构和扩展点

---

## 🆘 需要帮助？

- **查看帮助**：`agentx --help`
- **查看命令帮助**：`agentx <command> --help`
- **问题反馈**：https://github.com/agentx/agentx-mcp/issues
- **讨论交流**：https://github.com/agentx/agentx-mcp/discussions

---

*文档版本：1.0.0 | 最后更新：2026-04-29*
