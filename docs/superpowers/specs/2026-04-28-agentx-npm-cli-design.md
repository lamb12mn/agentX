# AgentX npm 打包 + CLI Companion 设计文档

> **版本**: v0.1 | **日期**: 2026-04-28

---

## 1. 背景与目标

AgentX MCP Server MVP 已完成（33个工具，FTS5搜索，53个测试全部通过）。下一阶段目标：

1. **npm 打包**：让用户通过 `npx agentx-mcp` 一键启动 MCP Server，无需手动克隆仓库
2. **CLI companion**：提供 `agentx` 命令行工具，让开发者无需 Claude 即可管理本地资产库

### 成功标准

- `npx agentx-mcp` 能启动 MCP Server，Claude Code 可通过 stdio 连接
- `agentx list skill` 输出格式化表格
- `agentx search <query>` 返回 FTS5 搜索结果
- `agentx export <id>` 生成 CLAUDE.md + settings.json
- 0 TypeScript 错误，现有 53 个测试全部通过

---

## 2. 架构设计

### 2.1 目录结构变更

```
agentx-mcp/
├── src/
│   ├── index.ts          # MCP Server 入口（现有，不变）
│   ├── cli.ts            # CLI 入口（新增）
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── list.ts   # agentx list [type]
│   │   │   ├── search.ts # agentx search <query>
│   │   │   ├── get.ts    # agentx get <id>
│   │   │   ├── create.ts # agentx create <type>
│   │   │   ├── delete.ts # agentx delete <id>
│   │   │   ├── export.ts # agentx export <agent-id>
│   │   │   └── import.ts # agentx import --type <type>
│   │   └── format.ts     # 表格/颜色输出工具
│   ├── store/            # 共享存储层（现有）
│   ├── tools/            # MCP 工具层（现有）
│   └── export/           # 导出模块（现有）
├── dist/                 # 编译输出
├── package.json
└── tsconfig.json
```

### 2.2 共享层设计

CLI 和 MCP Server 共享同一套 `store/` 层，不重复实现：

```
CLI commands → store/assets.ts, store/search.ts, export/claude.ts
MCP tools   → store/assets.ts, store/search.ts, export/claude.ts
```

两个入口点独立编译，共享业务逻辑。

---

## 3. npm 打包

### 3.1 package.json 变更

```json
{
  "name": "agentx-mcp",
  "version": "1.0.0",
  "description": "Local-first agent factory MCP Server for Claude Code",
  "type": "module",
  "bin": {
    "agentx-mcp": "./dist/index.js",
    "agentx": "./dist/cli.js"
  },
  "files": [
    "dist/",
    "README.md"
  ],
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build && npm test"
  }
}
```

### 3.2 入口 shebang

`src/index.ts` 和 `src/cli.ts` 顶部均需添加：
```
#!/usr/bin/env node
```

编译后 `dist/index.js` 和 `dist/cli.js` 自动获得可执行权限。

### 3.3 用户安装方式

```bash
# 方式 1：npx 直接运行（推荐）
npx agentx-mcp

# 方式 2：全局安装
npm install -g agentx-mcp
agentx-mcp  # 启动 MCP Server
agentx list # 使用 CLI

# Claude Code settings.json 配置
{
  "mcpServers": {
    "agentx": {
      "command": "npx",
      "args": ["agentx-mcp"]
    }
  }
}
```

---

## 4. CLI 命令设计

### 4.1 命令列表

| 命令 | 说明 | 示例 |
|------|------|------|
| `agentx list [type]` | 列出资产，type 可选 | `agentx list skill` |
| `agentx search <query>` | FTS5 全文搜索 | `agentx search "代码审查"` |
| `agentx get <id>` | 查看资产详情和内容 | `agentx get abc-123` |
| `agentx create <type>` | 交互式创建资产 | `agentx create skill` |
| `agentx delete <id>` | 删除资产 | `agentx delete abc-123` |
| `agentx export <id>` | 导出 agent | `agentx export def-456` |
| `agentx import` | 从 Claude 目录导入 | `agentx import --type skill` |
| `agentx info` | 显示资产库统计 | `agentx info` |

### 4.2 输出格式

**list 命令**：
```
$ agentx list skill
┌──────────┬───────────────────┬───────────────┬─────────┐
│ ID       │ Name              │ Tags          │ Updated │
├──────────┼───────────────────┼───────────────┼─────────┤
│ abc-123  │ code-review       │ dev, review   │ 2d ago  │
│ def-456  │ writing-polish    │ writing       │ 5d ago  │
└──────────┴───────────────────┴───────────────┴─────────┘
2 skills found.
```

**search 命令**：
```
$ agentx search "代码审查"
Found 3 results:
  [0.92] code-review (skill) — 专注于代码质量审查的技能
  [0.71] refactoring (skill) — 重构建议和最佳实践
  [0.45] code-assistant (agent) — 代码助手智能体
```

**info 命令**：
```
$ agentx info
AgentX Asset Library (~/.agentx/)
  skills:    12
  prompts:    5
  rules:      8
  mcps:       3
  workflows:  2
  agents:     4
  ─────────────
  total:     34 assets
  db:        ~/.agentx/agentx.db (128 KB)
```

### 4.3 技术选型

- **CLI 框架**：`commander` v12（轻量，ESM 友好，无额外依赖）
- **表格输出**：`cli-table3`（格式化表格）
- **颜色**：`chalk` v5（ESM，终端颜色）
- **交互式输入**：`@inquirer/prompts`（create 命令用）

---

## 5. ZIP 导出扩展（轻量附加）

扩展现有 `export_agent` 工具，增加 `format` 参数：

```typescript
// tools/agents.ts 中 export_agent 新增参数
format?: 'claude' | 'zip'  // 默认 'claude'
```

ZIP 包内容：
```
{agent-name}.agentx.zip
├── CLAUDE.md
├── settings.json
├── skills/
│   └── *.md
├── prompts/
│   └── *.md
└── rules/
    └── *.md
```

技术：Node.js 内置 `zlib` + `tar`，或轻量 `archiver` 包。

---

## 6. 实现顺序

### Phase 1（可并行）

- **P1-A**：npm 打包配置
  - 更新 `package.json`（bin、files、engines）
  - 添加 shebang 到 `src/index.ts`
  - 验证 `npm pack` 输出正确

- **P1-B**：CLI 框架搭建
  - 安装 `commander`、`chalk`、`cli-table3`
  - 创建 `src/cli.ts` 入口
  - 实现 `list` 和 `search` 命令

### Phase 2（依赖 P1-B）

- 实现 `get`、`delete`、`export`、`import` 命令
- 实现 `create` 命令（交互式，依赖 `@inquirer/prompts`）
- 实现 `info` 命令

### Phase 3（独立）

- ZIP 导出扩展

---

## 7. 非功能性需求

| 需求 | 指标 |
|------|------|
| CLI 启动时间 | < 500ms（冷启动） |
| list 响应 | < 100ms（SQLite 索引） |
| 兼容性 | Node.js 18+，macOS/Windows/Linux |
| 包大小 | `npm pack` 输出 < 5MB |

---

## 8. 不在本次范围内

- Web UI（独立子项目）
- `run_agent` / Claude API 集成
- 调试步骤回放
- 团队协作 / Git 同步
