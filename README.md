# AgentX 🚀

> 本地优先的智能体工厂 - 让您像搭乐高一样组合 Skills、MCP、提示词、规则，快速构建、调试、部署个性化智能体。

[![License](https://img.shields.io/badge/license-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/agentx/releases)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
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
#       "command": "agentx-mcp"
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

- **Node.js**: ≥ 18.0.0
- **操作系统**: Windows 10+ / macOS 10.15+ / Linux (任何现代发行版)
- **内存**: 至少 50MB 可用空间（SQLite 数据库 + 资产文件）

---

### 验证安装

```bash
# 检查版本
agentx --version
# 输出: 1.0.0

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
      "args": []
    }
  }
}
```

**配置说明**：
- `command`: 可以是 `agentx-mcp`（全局安装）或 `node /path/to/dist/index.js`（本地路径）
- 启动后，Claude Code 会自动发现并调用 AgentX 提供的 33 个工具

#### 可用工具列表

Claude Code 中可以使用的工具（共 33 个）：

**Skills 管理**（5 个）：
- `list_skills` - 列出所有技能
- `get_skill` - 获取技能详情
- `create_skill` - 创建新技能
- `update_skill` - 更新技能
- `delete_skill` - 删除技能

**Prompts 管理**（5 个）：
- `list_prompts` - 列出所有提示词
- `get_prompt` - 获取提示词详情
- `create_prompt` - 创建提示词
- `update_prompt` - 更新提示词
- `delete_prompt` - 删除提示词

**Rules 管理**（5 个）：
- `list_rules` - 列出所有规则
- `get_rule` - 获取规则详情
- `create_rule` - 创建规则
- `update_rule` - 更新规则
- `delete_rule` - 删除规则

**MCPs 管理**（5 个）：
- `list_mcps` - 列出所有 MCP 配置
- `get_mcp` - 获取 MCP 配置详情
- `create_mcp` - 创建 MCP 配置
- `update_mcp` - 更新 MCP 配置
- `delete_mcp` - 删除 MCP 配置

**Agents 管理**（6 个）：
- `list_agents` - 列出所有智能体
- `get_agent` - 获取智能体详情
- `create_agent` - 创建智能体
- `update_agent` - 更新智能体
- `delete_agent` - 删除智能体
- `export_agent` - 导出智能体

**其他工具**：
- `search_assets` - 全文搜索所有资产
- `import_assets` - 从 Claude Code 导入资产

> **详细 API 文档**：参见 [docs/API_REFERENCE.md](docs/API_REFERENCE.md)

---

### CLI 命令详解

AgentX 提供功能完整的命令行工具 `agentx`。当前支持的命令：

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
db:          /Users/alice/.agentx/db.sqlite (156 KB)
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

> **注意**: 创建资产当前仅通过 MCP 服务器（Claude Code）支持，CLI 暂未提供创建功能。

---

### 资产类型说明

AgentX 支持 6 种资产类型，每种类型对应不同的文件格式和用途。

| 类型 | 文件扩展名 | 存储目录 | 用途 |
|------|-----------|---------|------|
| **Skill** | `.md` | `skills/` | 可调用的能力单元（如代码审查、写作润色） |
| **Prompt** | `.md` | `prompts/` | 角色/任务模板（系统提示、few-shot 示例） |
| **Rule** | `.md` | `rules/` | 约束与行为准则（输出语言、安全限制） |
| **MCP** | `.json` | `mcps/` | 外部工具连接器（文件系统、GitHub、数据库） |
| **Workflow** | `.yaml` | `workflows/` | 多步骤编排逻辑（顺序/并行/条件分支） |
| **Agent** | `.yaml` | `agents/{id}/` | 以上积木的组合体（完整智能体定义） |

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
├── agentx-mcp/              # 主项目（源代码）
│   ├── src/
│   │   ├── index.ts         # MCP 服务器入口
│   │   ├── cli.ts           # CLI 工具入口
│   │   ├── types.ts         # TypeScript 类型定义
│   │   ├── cli/             # CLI 命令模块
│   │   │   ├── commands/    # 子命令实现
│   │   │   └── format.ts    # 表格格式化
│   │   ├── tools/           # MCP 工具注册
│   │   │   ├── skills.ts    # 技能管理工具
│   │   │   ├── agents.ts    # 智能体管理工具
│   │   │   ├── prompts.ts   # 提示词管理工具
│   │   │   ├── rules.ts     # 规则管理工具
│   │   │   ├── mcps.ts      # MCP 配置工具
│   │   │   ├── search.ts    # 搜索工具
│   │   │   └── import.ts    # 导入工具
│   │   ├── store/           # 数据存储层
│   │   │   ├── db.ts        # SQLite 初始化
│   │   │   ├── assets.ts    # 资产 CRUD
│   │   │   └── search.ts    # 全文搜索
│   │   └── export/          # 导出功能
│   │       └── claude.ts    # 导出为 Claude 格式
│   ├── dist/                # 编译输出
│   ├── tests/               # 测试文件
│   ├── package.json         # 项目配置
│   └── tsconfig.json        # TypeScript 配置
├── docs/                    # 项目文档
│   ├── USER_GUIDE.md       # 用户指南
│   ├── API_REFERENCE.md    # API 参考
│   ├── CONFIGURATION.md    # 配置说明
│   ├── TROUBLESHOOTING.md  # 故障排除
│   ├── ARCHITECTURE.md     # 架构设计
│   └── EXAMPLES/           # 示例资产
├── README.md               # 项目首页（本文件）
├── CONTRIBUTING.md         # 贡献指南
├── CHANGELOG.md            # 版本历史
└── CLAUDE.md               # 编码准则
```

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
| `npm start` | 运行 MCP 服务器 |
| `npm test` | 运行单元测试 |
| `npm run build && npm start` | 构建后启动 |

### 代码规范

- 遵循 TypeScript 严格模式
- 使用 ESLint（如有配置）
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

A: 当前版本为单用户设计。团队协作功能（Git 同步、权限管理）在路线图中，敬请期待。

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
- **架构设计**：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **故障排除**：[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- **问题反馈**：https://github.com/agentx/agentx-mcp/issues

---

**⭐ 如果这个项目对您有帮助，请给我们一个 Star！**

*最后更新：2026-04-29*

### 环境变量配置

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AGENTX_DIR` | `~/.agentx/` | 自定义数据存储根目录（SQLite 数据库 + 资产文件） |

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

