# AgentX 🚀

> 本地优先的智能体工厂 - 让您像搭乐高一样组合 Skills、MCP、提示词、规则，快速构建、调试、部署个性化智能体。

[![License](https://img.shields.io/badge/license-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Version](https://img.shields.io/badge/version-2.0.1-green.svg)](https://github.com/agentx/releases)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/agentx/actions)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-orange.svg)](https://github.com/agentx/pulls)

---

## 📖 目录

- [核心特性](#-核心特性)
- [快速开始](#-快速开始)
  - [5 分钟快速入门](#5-分钟快速入门)
  - [安装](#安装)
  - [验证安装](#验证安装)
- [使用指南](#-使用指南)
  - [MCP 服务器集成](#mcp-服务器集成)
  - [CLI 命令详解](#cli-命令详解)
  - [资产类型说明](#资产类型说明)
- [项目结构](#-项目结构)
- [开发](#-开发)
- [故障排除](#-故障排除)
- [常见问题](#-常见问题)
- [贡献](#-贡献)
- [许可证](#-许可证)

---

## ✨ 核心特性

| 特性 | 描述 |
|------|------|
| **本地优先** | 所有数据存储在本地 `~/.agentx/`，完全掌控，无需云端 |
| **Git 友好** | 资产以独立文件存储，完美支持版本控制 |
| **积木式组装** | 像搭乐高一样组合 Skills、Prompts、Rules、MCPs |
| **双入口模式** | 同时支持 MCP 服务器（Claude Code）和 CLI 命令行 |
| **SQLite 索引** | 快速全文搜索，毫秒级响应 |
| **跨平台** | 支持 Windows、macOS、Linux |

---

## 🚀 快速开始

### 5 分钟快速入门

**场景**：您想创建一个"代码审查助手"智能体，具备代码审查技能，遵守安全规则，并能访问文件系统。

```bash
# 1. 安装 AgentX（全局）
npm install -g agentx-mcp

# 2. 配置 Claude Code 使用 AgentX MCP 服务器
# 编辑 ~/.claude.json（Windows: %USERPROFILE%\.claude.json）：
# {
#   "mcpServers": {
#     "agentx": {
#       "command": "agentx-mcp",
#       "args": [],
#       "env": {
#         "AGENTX_DIR": "~/.agentx"
#       }
#     }
#   }
# }

# 3. 启动 Claude Code，通过对话创建资产
# 在 Claude Code 中发送：
# "请帮我创建一个名为 'code-review' 的技能，内容是关于代码审查的..."
# "请帮我创建一个名为 'no-sensitive-data' 的规则，禁止输出敏感数据..."
# "请帮我创建一个名为 'my-code-assistant' 的智能体，组合上述技能和规则..."

# 4. 验证资产已创建（使用 CLI）
agentx list skill
agentx list rule
agentx list agent

# 5. 导出智能体为 Claude Code 格式
agentx export <agent-id> -o ./my-assistant

# 6. 在项目中使用
# 将生成的 CLAUDE.md 和 settings.json 复制到您的项目目录
```

**完成！** 您现在拥有一个可工作的代码审查智能体。

---

### 安装

#### 方式一：npm 全局安装（推荐）

```bash
# 使用 npm 安装
npm install -g agentx-mcp

# 验证安装
agentx --help
```

#### 方式二：本地开发安装

```bash
# 克隆项目
git clone https://github.com/agentx/agentx-mcp.git
cd agentx-mcp

# 安装依赖
npm install

# 构建
npm run build

# 链接到全局（可选）
npm link
```

#### 系统要求

- **Node.js**: ≥ 20.0.0（与 `agentx-mcp/package.json` 的 `engines.node` 一致）
- **操作系统**: Windows 10+ / macOS 10.15+ / Linux (任何现代发行版)
- **内存**: 至少 50MB 可用空间（SQLite 数据库 + 资产文件）

---

### 验证安装

```bash
# 检查版本
agentx --version
# 输出: 2.0.1

# 查看帮助
agentx --help
# 输出: 所有可用命令列表

# 查看信息
agentx info
# 输出: 资产库统计信息
```

---

## 📘 使用指南

### MCP 服务器集成

AgentX 可以作为 MCP 服务器运行，供 Claude Code 调用。

#### 配置 Claude Code

在 Claude Code 的配置文件中添加：

**macOS/Linux**: `~/.claude.json`
**Windows**: `%USERPROFILE%\.claude.json`

```json
{
  "mcpServers": {
    "agentx": {
      "command": "agentx-mcp",
      "args": [],
      "env": {
        "AGENTX_DIR": "~/.agentx"
      }
    }
  }
}
```

**配置说明**：
- `command`: 可以是 `agentx-mcp`（全局安装）或 `node /path/to/dist/index.js`（本地路径）
- 启动后，Claude Code 默认只看到 22 个高频工具与 2 个元工具（`match_tools` / `discover_tools`）；不确定用哪个工具时把用户原话交给 `match_tools`，隐藏工具仍可按原名直接调用（完整清单见 [docs/API_REFERENCE.md](docs/API_REFERENCE.md)）

#### 可用工具列表

当前基础模式注册 **76 个工具**（17 个注册模块）；设置 `AGENTX_ENHANCED=true` 后额外注册 **38 个增强工具**，合计 114 个。**默认只在 `tools/list` 暴露 24 个**（22 个核心工具 + `match_tools` + `discover_tools`），其余工具仍可按原名直接调用；设置 `AGENTX_TOOLS=full` 可恢复全量暴露。工具名与 `inputSchema` 以运行时 `tools/list` 为准，逐项说明见 [docs/API_REFERENCE.md](docs/API_REFERENCE.md)。

**资产 CRUD**（30 个）：`skills | prompts | rules | mcps | workflows | agents` 六类各提供 `list_*`、`get_*`、`create_*`、`update_*`、`delete_*`。

**搜索与导入**（2 个）：`search_assets`（FTS5 全文搜索）、`import_from_claude`（从 Claude Code 导入）。

**批量与克隆**（4 个）：`batch_delete`、`batch_tag_add`、`batch_tag_remove`、`clone_asset`。

**版本与导出**（8 个）：`create_version_snapshot`、`list_versions`、`get_version`、`rollback_to_version`、`clear_versions`、`version_stats`、`export_agent`、`export_all`。

**依赖与评测**（19 个）：`check_dependencies`、`get_dependents`、`get_dependencies`、`get_dependency_graph`、`detect_circular_dependency`、`create_evaluation_set`、`list_evaluation_sets`、`add_evaluation_sample`、`add_evaluation_samples`、`list_evaluation_samples`、`rate_evaluation_sample`、`evaluation_summary`、`compare_evaluation_sets`、`suggest_prompt_improvements`、`apply_evaluation_dsl`、`ai_rate_evaluation_samples`、`ai_rewrite_prompt`、`ai_generate_evaluation_samples`、`apply_prompt_rewrite`。评测默认全程本地（`score` 1-5 分 / `gsb` 比较），不调用外部模型；`{{变量}}` 本地渲染，可由种子提问批量构建评测数据集、筛选低分样本、对比两个版本、并由 `suggest_prompt_improvements` 产出**纯规则**建议、`apply_evaluation_dsl` 按本地规则 DSL（`and` / `or` / 括号）自动批量打分。`ai_rate_evaluation_samples` / `ai_rewrite_prompt` / `ai_generate_evaluation_samples` 仅在设置 `AGENTX_AI_API_KEY` 后调用外部模型（后者从种子样本批量生成变量并跑出回答），未配置时明确报错（不伪造结果）；AI 改写只返回候选文本，必须显式调用 `apply_prompt_rewrite` 才会写回资产、创建版本快照并绑定新评测集（传入候选文本时可完全离线，`dryRun` 只预览）。

**团队编排**（11 个）：`team.create`、`team.run`、`team.status`、`team.results`、`team.cancel`、`team.list`、`team.history`、`team.logs`、`team.approve`、`team.reject`、`team.pending`。

**工具发现与意图路由**（2 个）：`match_tools`（自然语言意图 → 排序后的工具候选，始终暴露）、`discover_tools`（按关键词 / 分组检索全部工具，始终暴露）。

**增强模式追加**（38 个）：`cache.*`（2）、`system.stats`（1）、`plugins.*`（4）、`sync.*`（5）、`ai.*`（4）、`api.*`（3）、`monitor.*`（4）、`editor.*`（6）、`ui.mobile.*`（3）、`vault.*`（6）。

> 基础工具实现位于 `agentx-mcp/src/tools/`，增强工具定义在 `agentx-mcp/src/index.ts`；两者均由 `src/index.ts` 汇总注册。

**工具分层暴露（默认生效）**

`tools/list` 默认只返回 22 个高频工具 + 两个元工具（`match_tools`、`discover_tools`），共 24 个。其余工具**仍注册、仍可按原名调用**，只是不出现在列表中，因此既有脚本与集成不会失效。

**不确定用哪个工具时，直接用 `match_tools`**——把用户原话（中文或英文）传进去即可，无需猜工具名：

```json
{ "name": "match_tools", "arguments": { "intent": "帮我看看有哪些提示词" } }
{ "name": "match_tools", "arguments": { "intent": "roll back to the previous version", "limit": 3 } }
{ "name": "match_tools", "arguments": { "intent": "列出所有提示词", "execute": true } }
```

返回 `matches[]`（`name` / `group` / `score` / `confidence` / `reasons[]` / `exposed` / `required` / `missing` / `callTemplate`），以及 `autoSelect` 与 `selected`。匹配为**纯本地**的中英双语动作 / 对象词典 + 加权打分（工具名 > 描述 > 分组），支持精确工具名、拼写近似（`list_promts` → `list_prompts`）与动作冲突惩罚；无网络调用、无新依赖。拿回名字后按原名调用即可，隐藏工具不需要先启用。

- `execute: true`：仅当意图明确（`autoSelect`）、必填参数齐全、且工具属于只读白名单（`list_*` / `get_*` / `search_*` / `check_*` / `compare_*` / `version_stats` / `evaluation_summary` / `team.status` 等）时才自动执行并返回 `executed`；**写操作一律拒绝自动执行**，只返回 `callTemplate` 与 `refused` 原因。
- `useAi: true`：可选地用 `AGENTX_AI_API_KEY` 对应模型对本地候选重排（未配置时明确报 `AiProviderNotConfiguredError`；模型报错则降级为本地结果并标注 `aiRerank.status = 'failed'`）。默认关闭，不影响本地路径。
- `discover_tools` 适合按关键词 / 分组浏览：`{ "group": "evaluations", "includeSchema": true }`；其 `groups` 字段给出各分组总数与已暴露数。
- `tools/call` 传入不存在的工具名时，错误提示会附上意图匹配出的 top-3 具体候选，而不是只让你去翻目录。

`AGENTX_TOOLS` 控制暴露范围（重启生效，未知名称会在启动时告警并跳过）：

| 取值 | 效果 |
|---|---|
| `core`（默认） | 22 个核心工具 + 2 个元工具 |
| `full` | 全部 76 个基础工具（增强模式下 114 个） |
| `core,apply_evaluation_dsl,team.create` | 核心集追加指定工具（元工具始终包含） |
| `list_skills,search_assets` | 只暴露列出的工具（自动包含两个元工具） |

---

### CLI 命令详解

AgentX 提供命令行工具 `agentx`，当前共有 **26 个顶层命令**（不含 `help`），完整列表以 `agentx --help` 为准：

| 分组 | 命令 |
|------|------|
| 资产 | `list`、`get`、`create`、`delete`、`clone`、`search`、`info`、`validate`、`templates` |
| 导入导出 | `import`、`export`、`export-all`、`backup`、`restore` |
| 编排与团队 | `team`（create/run/status/results/cancel/list/history/logs/approve/reject/pending）、`graph` |
| 批量与 MCP | `batch`、`mcp`（send/inspect）、`proxy`、`init` |
| 评测 | `evaluation`（snapshot/create/list/add-sample/add-samples/rate/samples/summary/compare/suggest/apply-dsl/ai-rate/ai-rewrite/ai-generate/apply-rewrite） |
| 运维 | `doctor`、`audit`、`vault`、`remote`（add/list/remove/pull/push）、`web` |

下列为常用命令的参数说明：

#### 1. `agentx list [type]`

列出所有资产，可按类型过滤。

```bash
# 列出所有资产
agentx list

# 仅列出技能
agentx list skill

# 仅列出提示词
agentx list prompt

# 仅列出规则
agentx list rule

# 仅列出 MCP 配置
agentx list mcp

# 仅列出工作流
agentx list workflow

# 仅列出智能体
agentx list agent
```

**输出示例**：
```
ID         Name               Tags                    Updated
---------- ------------------ -----------------------  --------
a1b2c3d4   code-review        dev,review              2h ago
e5f6g7h8   no-sensitive-data  security                1d ago
```

#### 2. `agentx search <query>`

全文搜索资产。

```bash
# 搜索包含"代码审查"的资产
agentx search "代码审查"

# 限制结果数量
agentx search "review" --limit 5
```

**输出示例**：
```
Found 2 results:
  [0.85] code-review (skill) — 专业的代码审查助手
  [0.72] review-guidelines (rule) — 代码审查准则
```

#### 3. `agentx info`

显示资产库统计信息。

```bash
agentx info
```

**输出示例**：
```
AgentX Asset Library (/Users/alice/.agentx)
skills:     5
prompts:    3
rules:      4
mcps:       2
workflows:  1
agents:     2
────────────────────
total:      17
db:          /Users/alice/.agentx/agentx.db (156 KB)
```

#### 4. `agentx get <id>`

显示资产详情和内容。

```bash
# 查看资产信息（不含内容）
agentx get a1b2c3d4

# 查看资产信息和完整内容
agentx get a1b2c3d4 --content
```

#### 5. `agentx delete <id>`

删除资产。

```bash
# 删除前会确认
agentx delete a1b2c3d4

# 跳过确认直接删除
agentx delete a1b2c3d4 --yes
```

#### 6. `agentx export <id>`

导出智能体为 Claude Code 格式。

```bash
# 导出到当前目录
agentx export my-agent

# 导出到指定目录
agentx export my-agent -o ./output
```

**生成文件**：
- `CLAUDE.md` - 智能体说明文档
- `settings.json` - MCP 服务器配置

#### 7. `agentx import <type>`

从 Claude Code 导入资产。

```bash
# 导入技能（从默认目录）
agentx import skill

# 指定源目录
agentx import prompt --source ~/.claude/prompts

# 添加自定义标签
agentx import rule --tags "security,imported"
```

> **提示**：创建资产也可直接使用 CLI：`agentx create -t skill -n my-skill -c '# 内容'`，或加 `-i` 进入交互模式；支持 `skill | prompt | rule | mcp | workflow | agent` 六种类型。

#### 8. `agentx evaluation`

本地 Prompt 评测闭环：14 个子命令与评测 MCP 工具一一对应，另有 `snapshot` 作为纯 CLI 前置辅助命令（评测集必须绑定已存在的版本快照）；所有子命令输出 JSON，便于脚本串联。

```bash
# 1. 创建版本快照，返回版本号（也可先用 MCP 的 create_version_snapshot）
agentx evaluation snapshot <assetId>

# 2. 绑定版本快照创建评测集（默认 score 模式，可用 --mode gsb）
agentx evaluation create <assetId> 1 baseline --mode score

# 3. 录入样本（{{变量}} 本地渲染）
agentx evaluation add-sample <setId> '总结 {{topic}}' '<回答>' --variables '{"topic":"SQLite"}'

# 4. 批量构建：samples.json 为 [{ "answer": "...", "variables": { ... } }, ...]
agentx evaluation add-samples <setId> '总结 {{topic}}' samples.json

# 5. 评分、聚焦弱项、汇总、对比新版本、生成改写建议
agentx evaluation rate <sampleId> --score 2 --feedback 'too short'
agentx evaluation samples <setId> --max-score 2
agentx evaluation summary <setId>
agentx evaluation compare <baselineSetId> <candidateSetId>
agentx evaluation suggest <setId> --max-score 2

# 6. 本地规则 DSL 自动批量打分（dsl.json 格式见 API 参考第 5 节）
agentx evaluation apply-dsl <setId> dsl.json --dry-run
agentx evaluation apply-dsl <setId> dsl.json

# 7. 可选 AI 能力（需先设置 AGENTX_AI_API_KEY）
agentx evaluation ai-rate <setId> --limit 20
agentx evaluation ai-rewrite <setId> --instructions '保持中文输出'

# 8. 从种子样本批量生成变量并跑出回答（--dry-run 只预览、不写库）
agentx evaluation ai-generate <setId> --count 5 --dry-run
agentx evaluation ai-generate <setId> --count 5

# 9. 把改写候选落成新版本 + 新评测集（传入候选可完全离线）
agentx evaluation ai-rewrite <setId> > candidate.json
agentx evaluation apply-rewrite <setId> candidate.json --dry-run
agentx evaluation apply-rewrite <setId> candidate.json
```

子命令：`snapshot` / `create` / `list` / `add-sample` / `add-samples` / `rate` / `samples` / `summary` / `compare` / `suggest` / `apply-dsl` / `ai-rate` / `ai-rewrite` / `ai-generate` / `apply-rewrite`。
`rate` 在 GSB 模式用 `--gsb good|same|bad`；`samples` 支持 `--rated` / `--unrated` / `--gsb` / `--max-score` / `--limit`；`suggest` 与 `apply-dsl` 为纯本地规则，不调用外部模型；`ai-rate` / `ai-rewrite` / `ai-generate` 未配置 `AGENTX_AI_API_KEY` 时明确报错并置 `exitCode = 1`；`apply-rewrite` 用 `--rewritten-prompt` 或候选 JSON 文件可完全离线，`--dry-run` 不写资产也不建版本。

> CLI 与 MCP 需设置同一个 `AGENTX_DIR` 才能访问同一份评测数据。

---

### 资产类型说明

`AssetType` 共 7 种：`skill | prompt | rule | mcp | workflow | agent | team`。其中前 6 种可通过 CLI `create` 或 MCP 工具创建，`team` 由 `team.*` 工具内部管理（团队配置），不开放给 `create`。

资产文件按 `{type}s/{name}{ext}` **平铺存放**（无按 ID 分目录），扩展名由 `src/store/assets.ts` 的 `fileExtension()` 决定：

| 类型 | 文件扩展名 | 存储目录 | 用途 |
|------|-----------|---------|------|
| **Skill** | `.md` | `skills/` | 可调用的能力单元（如代码审查、写作润色） |
| **Prompt** | `.md` | `prompts/` | 角色/任务模板（系统提示、few-shot 示例） |
| **Rule** | `.md` | `rules/` | 约束与行为准则（输出语言、安全限制） |
| **MCP** | `.yaml` | `mcps/` | 外部工具连接器（文件系统、GitHub、数据库） |
| **Workflow** | `.yaml` | `workflows/` | 多步骤编排逻辑（顺序/并行/条件分支） |
| **Agent** | `.yaml` | `agents/` | 以上积木的组合体（完整智能体定义） |
| **Team** | `.yaml` | `teams/` | 多智能体编排配置，由 `team.*` 工具读写 |

#### 资产示例

**Skill 示例** (`code-review.md`)：
```markdown
# 代码审查

## 职责
- 检查代码质量
- 发现潜在bug
- 建议性能优化

## 检查清单
- [ ] 变量命名清晰
- [ ] 无硬编码密码
- [ ] 错误处理完善
```

**Agent 示例** (`agent.yaml`)：
```yaml
name: "代码助手"
version: "1.0.0"
description: "专注于代码审查和重构"

role_prompt: prompts/code-expert.md

rules:
  - rules/no-sensitive-output.md
  - rules/always-chinese.md

skills:
  - skills/code-review.md
  - skills/refactoring.md

mcps:
  - name: filesystem
    enabled: true
  - name: github
    enabled: false

workflow: workflows/code-review-flow.yaml
```

---

## 📁 项目结构

```
agentX/
├── agentx-mcp/              # 主项目（TypeScript 源码）
│   ├── src/                 # 入口 index.ts / index-enhanced.ts / cli.ts / types.ts
│   ├── tests/               # vitest 测试
│   ├── dist/                # 编译输出
│   ├── package.json         # 版本、依赖与 engines（事实以此为准）
│   └── tsconfig.json        # TypeScript 配置
├── .github/workflows/       # CI 与发布流水线
├── docs/                    # API 参考、评审与规划文档
├── README.md               # 项目首页（本文件）
├── AGENTS.md / CLAUDE.md    # 代理与编码准则
├── CONTRIBUTING.md         # 贡献指南
└── CHANGELOG.md            # 版本历史
```

`src/` 下的主要模块：`cli/`、`tools/`、`store/`，以及 `api/`、`ai/`、`audit/`、`editor/`、`export/`、`monitoring/`、`observability/`、`orchestrator/`、`plugins/`、`remote/`、`security/`、`sync/`、`templates/`、`types/`、`ui/`、`utils/`、`web/`。完整文件清单以仓库实际目录为准。

---

## 🔧 开发

### 开发环境搭建

```bash
# 1. 克隆项目
git clone https://github.com/agentx/agentx-mcp.git
cd agentx-mcp

# 2. 安装依赖
npm install

# 3. 构建
npm run build

# 4. 运行测试
npm test
```

### 开发命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 编译 TypeScript 到 `dist/` 目录 |
| `npm run typecheck` | 类型检查（`tsc --noEmit`） |
| `npm run lint` | ESLint 静态检查 |
| `npm start` | 运行 MCP 服务器 |
| `npm test` | 运行单元测试（vitest） |
| `npm run build && npm start` | 构建后启动 |

### 增强模式（可选）

设置 `AGENTX_ENHANCED=true` 后，MCP 服务器会懒加载一组增强模块；不设置时这些模块不会启动。也可使用 `npm run start:enhanced`（Windows 下为 `set AGENTX_ENHANCED=true && ...`）。

额外能力：REST API（`/health`、`/api/assets`、`/api/stats`、`/api/cache/stats` 等）、监控面板、云同步、AI 助手、插件加载、可视化工作流编辑器、移动端 UI 与运行时缓存统计。

相关环境变量：`AGENTX_API_PORT`（默认 3000）、`AGENTX_API_HOST`（默认 localhost）、`AGENTX_API_KEY`（启用 REST 认证）、`AGENTX_MONITOR_INTERVAL`（默认 5000ms）。

> 提示：`/api/workflows/execute` 已接入 `TeamEngine`，会读取 workflow 资产的 YAML 并同步执行；未配置 AI provider 时返回结果带 `simulated: true`，明确标记走了本地兜底。

### 代码规范

- 遵循 TypeScript 严格模式
- 使用 ESLint（配置见 `agentx-mcp/eslint.config.js`）
- 提交前运行 `npm test` 确保测试通过
- 提交信息使用约定式提交：[Conventional Commits](https://www.conventionalcommits.org/)

---

## 🛠️ 故障排除

### 常见问题

#### 1. **"command not found: agentx"**

**原因**：npm 全局安装路径未加入 PATH。

**解决**：
```bash
# 查看 npm 全局安装路径
npm config get prefix

# 添加到 PATH（根据 shell 配置）
# Windows (PowerShell):
$env:Path += ";C:\Users\YourName\AppData\Roaming\npm"

# macOS/Linux (bash/zsh):
export PATH="$HOME/.npm-global/bin:$PATH"
```

#### 2. **"Error: SQLITE_CANTOPEN: unable to open database file"**

**原因**：`~/.agentx/` 目录不存在或权限不足。

**解决**：
```bash
# 手动创建目录
mkdir -p ~/.agentx

# Windows PowerShell:
mkdir $HOME\.agentx
```

#### 3. **"MCP 工具未在 Claude Code 中显示"**

**原因**：配置文件格式错误或路径不对。

**解决**：
1. 检查配置文件路径是否正确
2. 验证 JSON 格式（使用 [JSONLint](https://jsonlint.com)）
3. 重启 Claude Code

#### 4. **"TypeScript 编译错误"**

**解决**：
```bash
# 清理并重新构建
rm -rf dist
npm run build
```

#### 5. **"was compiled against a different Node.js version"**

**原因**：`better-sqlite3` 是原生模块，切换 Node 主版本后二进制未重新编译。MCP 服务器在顶层 `initDb()` 阶段就会退出，测试也会全部失败。

**解决**：
```bash
# 重新编译原生模块（在 agentx-mcp 目录下）
npm rebuild better-sqlite3
```
确认当前 Node 版本满足 `engines.node`（≥ 20）后重启服务。

---

## ❓ 常见问题

**Q: AgentX 和 Claude Code 是什么关系？**

A: AgentX 是 Claude Code 的补充工具。Claude Code 是 AI 编程助手，AgentX 提供资产管理和智能体组装能力，两者通过 MCP 协议集成。

---

**Q: 资产存储在哪里？**

A: 默认存储在 `~/.agentx/`（Windows: `%USERPROFILE%\.agentx\`）。可通过环境变量 `AGENTX_DIR` 自定义：
```bash
export AGENTX_DIR="/path/to/custom/dir"
```

---

**Q: 如何备份我的资产？**

A: 直接复制 `~/.agentx/` 目录即可。所有资产以独立文件存储，易于备份和迁移。

---

**Q: 支持团队协作吗？**

A: 本地资产库仍是单用户设计，但已提供 `agentx remote`（推送/拉取远程库）、`team.*`（多智能体编排）和 `vault`（凭据加密）。云端多人权限管理尚未实现。

---

**Q: 如何更新到最新版本？**

A:
```bash
npm update -g agentx-mcp
```

---

## 🤝 贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解：

- 开发环境搭建
- 代码规范
- 测试要求
- 提交流程

---

## 📄 许可证

本项目采用 **ISC** 许可证。详见 [LICENSE](LICENSE) 文件。

---

## 🙏 致谢

- [Model Context Protocol](https://modelcontextprotocol.io) - 强大的协议规范
- [Claude Code](https://claude.ai/code) - 优秀的 AI 编程助手
- 所有贡献者和社区成员

---

## 📚 更多资源

- **详细文档**：查看 [docs/](docs/) 目录
- **API 参考**：[docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- **架构与演进设计**：[docs/superpowers/specs/2026-04-28-agentx-v2-design.md](docs/superpowers/specs/2026-04-28-agentx-v2-design.md)
- **Team Engine 设计**：[docs/superpowers/specs/2026-06-13-team-engine-improvements-design.md](docs/superpowers/specs/2026-06-13-team-engine-improvements-design.md)
- **故障排除**：见本页 [故障排除](#-故障排除) 章节
- **问题反馈**：https://github.com/agentx/agentx-mcp/issues

---

**⭐ 如果这个项目对您有帮助，请给我们一个 Star！**

*最后更新：2026-11-08*

### 环境变量配置

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AGENTX_DIR` | `~/.agentx` | 自定义数据存储根目录（SQLite `agentx.db` + 资产文件） |
| `AGENTX_ENHANCED` | `false` | 设为 `true` 启用增强模块与 38 个增强工具 |
| `AGENTX_TOOLS` | `core` | 控制 `tools/list` 暴露范围：`core` / `full` / 逗号分隔工具名（可含 `core` 追加）；`match_tools` 与 `discover_tools` 始终暴露，隐藏工具仍可直接调用 |
| `AGENTX_API_PORT` | `3000` | REST API 端口（增强模式） |
| `AGENTX_API_HOST` | `localhost` | REST API 监听地址（增强模式） |
| `AGENTX_API_KEY` | 未设置 | 设置后启用 REST API 认证；未设置时认证关闭并输出警告 |
| `AGENTX_MONITOR_INTERVAL` | `5000` | 监控面板刷新间隔（ms，增强模式） |
| `AGENTX_AI_API_KEY` | 未设置 | 设置后为 `TeamEngine`、AI 评测工具及 `match_tools({ useAi: true })` 注入 OpenAI 兼容 provider；未设置时保持纯本地 |
| `AGENTX_AI_BASE_URL` | `https://api.openai.com/v1` | 任意 OpenAI 兼容端点（如本地 Ollama） |
| `AGENTX_AI_MODEL` | `gpt-4o-mini` | 默认模型名，工具可用 `model` 参数覆盖 |

源码中另有 `AGENTX_HOME`、`AGENTX_VAULT_*`、`AGENTX_OTEL_*`、`AGENTX_MCP_*`、`AGENTX_LOG_LEVEL` 等变量，完整清单以 `agentx-mcp/src/` 为准。

**MCP 服务器配置示例**（仅对 MCP 实例生效）：
```json
{
  "mcpServers": {
    "agentx": {
      "command": "agentx-mcp",
      "args": [],
      "env": {
        "AGENTX_DIR": "D:/my-agentx-data"
      }
    }
  }
}
```

**CLI 使用**：需在运行前设置系统环境变量或在 shell 配置文件中持久化：
```bash
# Linux / macOS
export AGENTX_DIR="/path/to/custom/dir"

# Windows PowerShell
$env:AGENTX_DIR = "D:\my-agentx-data"
```

> ⚠️ CLI 不会读取 MCP 配置中的 `env`，需单独设置以确保两者访问同一份数据。

