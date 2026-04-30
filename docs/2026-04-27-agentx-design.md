# AgentX 需求设计文档

> **项目定位**：本地优先的「智能体工厂」，让用户像搭乐高一样组合 Skills/MCP/提示词/规则，快速构建、调试、部署个性化智能体。

---

## 1. 背景与目标

### 1.1 问题陈述

当前 AI 工具链（Claude Code、Cursor 等）的配置高度分散：
- Skills 散落在文件系统各处，缺乏统一管理
- MCP 配置手动维护，切换成本高
- 提示词/规则以纯文本存储，无版本管理
- 智能体组合依赖手动编辑 CLAUDE.md，无可视化

### 1.2 目标用户

| 用户类型 | 主要诉求 |
|---------|---------|
| 个人开发者 | 管理自己的 Claude Code 配置，快速切换不同场景的智能体 |
| 小团队 | 共享 Skills 库，协作构建智能体，统一团队规范 |

### 1.3 成功标准

- 用户能在 5 分钟内从零创建一个可用的智能体
- 支持个人本地使用，同时预留团队协作扩展能力
- 所有资产以文件形式存储，Git 友好

---

## 2. 核心概念模型

```
智能体 = 角色提示词 + 规则集 + Skills[] + MCP[] + 工作流
```

### 2.1 积木类型

| 类型 | 描述 | 存储格式 |
|------|------|---------|
| **Skill** | 可调用的能力单元（如代码审查、写作润色） | `.md` 文件 |
| **MCP** | 外部工具连接器（浏览器、文件系统、数据库） | `mcp.json` 配置 |
| **提示词** | 角色/任务模板（系统提示、few-shot 示例） | `.md` / `.txt` |
| **规则** | 约束与行为准则（输出语言、安全限制） | `.md` 文件 |
| **工作流** | 多步骤编排逻辑（顺序/并行/条件分支） | `.yaml` 文件 |
| **智能体** | 以上积木的组合体 | `agent.yaml` |

---

## 3. 系统架构

### 3.1 整体架构

```
┌─────────────────────────────────────────┐
│           Web UI（可选）                  │
│   资产浏览 / 可视化编排 / 调试界面          │
└──────────────┬──────────────────────────┘
               │ HTTP / WebSocket
┌──────────────▼──────────────────────────┐
│           MCP Server（核心）              │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │  资产管理器  │  │   执行引擎        │  │
│  │  CRUD/搜索  │  │  调用 Claude API  │  │
│  └─────────────┘  └──────────────────┘  │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │  导出模块   │  │   调试记录器      │  │
│  │ CLAUDE.md等 │  │  步骤状态追踪     │  │
│  └─────────────┘  └──────────────────┘  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         本地文件系统 + SQLite 索引         │
│   ~/.agentx/                             │
│   ├── skills/                            │
│   ├── mcps/                              │
│   ├── prompts/                           │
│   ├── rules/                             │
│   ├── workflows/                         │
│   └── agents/                            │
└─────────────────────────────────────────┘
```

### 3.2 技术选型

| 层次 | 技术 | 理由 |
|------|------|------|
| MCP Server | Node.js (TypeScript) | 与 Claude Code 生态一致 |
| 本地存储 | 文件系统 + SQLite | 文件 Git 友好，SQLite 提供快速索引 |
| Web UI | React + Vite | 轻量，本地启动快 |
| 实时通信 | WebSocket | 调试步骤实时推送 |

---

## 4. 功能模块详细设计

### 4.1 资产管理（MVP 核心）

**MCP 工具列表：**

```
list_skills        列出所有 Skills，支持标签过滤
get_skill          获取单个 Skill 详情
create_skill       创建新 Skill
update_skill       更新 Skill 内容
delete_skill       删除 Skill

list_mcps          列出所有 MCP 配置
toggle_mcp         启用/禁用某个 MCP
get_mcp_config     获取 MCP 配置详情

list_prompts       列出所有提示词
create_prompt      创建提示词
list_rules         列出所有规则
create_rule        创建规则

list_agents        列出所有智能体
get_agent          获取智能体详情（含组合的积木）
create_agent       创建智能体（指定积木组合）
update_agent       更新智能体配置
delete_agent       删除智能体
run_agent          在沙盒中运行智能体
export_agent       导出为 CLAUDE.md / MCP Server
```

### 4.2 智能体编排

**agent.yaml 格式示例：**

```yaml
name: "代码助手"
version: "1.0.0"
description: "专注于代码审查和重构的智能体"

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

### 4.3 调试模块

- **沙盒执行**：隔离环境运行，不影响生产配置
- **步骤回放**：记录每个 Skill/MCP 调用的输入输出
- **提示词热更新**：修改后立即生效，无需重启
- **Mock MCP**：用假数据测试流程，不调用真实外部服务

### 4.4 导出模块

| 导出格式 | 用途 |
|---------|------|
| `CLAUDE.md` | 直接用于 Claude Code |
| `settings.json` | Claude Code MCP 配置 |
| MCP Server 包 | 将智能体打包为独立 MCP 工具 |
| ZIP 分享包 | 分享给他人，解压即用 |

---

## 5. 数据模型

### 5.1 资产元数据（SQLite）

```sql
-- 资产索引表（所有类型通用）
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- skill/mcp/prompt/rule/workflow/agent
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT,                 -- JSON 数组
  file_path TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

-- 智能体组合关系表
CREATE TABLE agent_components (
  agent_id TEXT NOT NULL,
  component_type TEXT NOT NULL,
  component_id TEXT NOT NULL,
  order_index INTEGER DEFAULT 0
);
```

### 5.2 文件系统结构

```
~/.agentx/
├── config.json              # 全局配置
├── db.sqlite                # 索引数据库
├── skills/
│   └── {id}/
│       ├── skill.md         # Skill 内容
│       └── meta.json        # 元数据（标签、版本等）
├── mcps/
│   └── {name}.json          # MCP 连接配置
├── prompts/
│   └── {id}.md
├── rules/
│   └── {id}.md
├── workflows/
│   └── {id}.yaml
└── agents/
    └── {id}/
        ├── agent.yaml       # 智能体定义
        └── debug/           # 调试记录
```

---

## 6. 团队协作设计（预留扩展）

MVP 阶段不实现，但架构预留：

- **Git 同步**：资产目录本身即 Git 仓库，`push/pull` 实现团队共享
- **权限管理**：`meta.json` 中预留 `owner` 和 `visibility` 字段
- **资产市场**：预留 `source` 字段标记资产来源（local/community/team）

---

## 7. MVP 范围（第一版）

### 包含

- [ ] 本地资产管理（Skills/MCP/提示词/规则 的 CRUD）
- [ ] 智能体创建（组合积木，生成 agent.yaml）
- [ ] 导出为 CLAUDE.md + settings.json
- [ ] MCP Server 实现（上述工具列表）
- [ ] SQLite 索引 + 标签搜索

### 不包含（后续版本）

- Web UI 可视化画布
- 工作流编排（条件分支/并行）
- 调试步骤回放
- 团队协作/Git 同步
- 资产市场

---

## 8. 非功能性需求

| 需求 | 指标 |
|------|------|
| 启动时间 | MCP Server 冷启动 < 2s |
| 搜索响应 | 资产搜索 < 100ms（SQLite 索引） |
| 文件兼容 | 所有资产文件可直接用文本编辑器编辑 |
| 平台支持 | macOS / Windows / Linux |
| 数据安全 | 所有数据本地存储，不上传云端 |

---

## 9. 开放问题

1. MCP Server 的安装方式：npm 全局包 vs 本地项目依赖？
2. 资产 ID 生成策略：UUID vs 用户自定义名称？
3. 与现有 superpowers 技能系统的集成方式？

---

*文档版本：v0.1 | 创建日期：2026-04-27*
