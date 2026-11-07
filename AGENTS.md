# AGENTS.md — 为 CodeBuddy 代理提供本项目开发指南

## 代码行为准则

### 1. 先想后做

**不要假设。不要隐藏困惑。暴露权衡点。**

实现前：
- 明确说出你的假设。不确定就问。
- 如果有多种理解方式，都要呈现，不要默默选择。
- 如果有更简单的方案，说出来。该反对时要反对。
- 如果有不清楚的地方，停下来。说清楚是什么在困扰你，然后问。

### 2. 简单优先

**最少代码解决问题。不要投机。**

- 不添加超出需求的功能。
- 单次使用的代码不抽象。
- 不添加没有被要求的"灵活性"或"可配置性"。
- 不处理不可能出现的情况错误。
- 如果 50 行能解决就不要写 200 行。

问自己："一个资深工程师会说这过度复杂吗？"如果会，简化。

### 3. 精准修改

**只碰必须碰的。只清理自己的乱子。**

编辑现有代码时：
- 不要"改进"相邻的代码、注释或格式。
- 不要重构没有坏的东西。
- 匹配现有风格，即使你用不同方式会做得更好。
- 发现无关的死代码，提一下但不要删。

当你的修改产生孤儿时：
- 删掉你修改导致的未使用 import/变量/函数。
- 不要删原本就存在的死代码，除非被要求。

检验标准：每一行修改都应该能追溯到用户的需求。

### 4. 目标驱动执行

**定义成功标准。循环验证直到通过。**

把任务转化为可验证的目标：
- "添加验证" → "为无效输入写测试，然后让测试通过"
- "修复 bug" → "写一个能复现 bug 的测试，然后让测试通过"
- "重构 X" → "确保重构前后测试都通过"

多步骤任务，简要说明计划：
```
1. [步骤] → 验证: [检查]
2. [步骤] → 验证: [检查]
3. [步骤] → 验证: [检查]
```

强的成功标准让你能独立循环。弱的标准（"让它能工作"）需要不断澄清。

---

**这些准则起效的标准是：** diff 中少了不必要的修改、少了因过度复杂而重写、澄清问题在错误之前而不是之后出现。

---

## 提交信息规范

一律使用 [Conventional Commits](https://www.conventionalcommits.org/)。完整格式、type 定义与示例以 [`CONTRIBUTING.md` 的「提交信息规范」](CONTRIBUTING.md) 为准，本节只列代理执行要点。

```
<type>(<scope>): <subject>

<body>

<footer>
```

- **type**：只用 `feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore`，不使用其它值。
- **scope**：可省略；仓库现有提交多数省略。需要时用模块名（如 `evaluation`、`cli`、`store`）。
- **subject**：仓库实际以中文为主；一句话说清改动，不用 `wip`、`fixed bug`、`updated stuff` 这类含糊表述。
- **body / footer**：可选；跨模块改动或有破坏性变更时补充。

示例（贴合仓库实际惯例）：

```bash
feat(evaluation): 新增本地 Prompt 评测集与评分工具
fix(api): 修复鉴权失败时请求挂起
docs: 同步 README 工具清单与 API 参考
```

代理执行约束：
- 仅在用户明确要求时才执行 `git commit`，不要顺手提交。
- 提交前跑 `npm run typecheck`、`npm run lint`、`npm test`；并复核暂存区，会话前既有改动与本次改动分开说明，不把无关改动带入。

---

<!-- CODEGRAPH_START -->
## CodeGraph

本项目已建立 `.codegraph/` 索引。需要理解或定位代码时，优先用 CodeGraph，不要先 grep 或逐个读文件：

- **MCP 工具**（可用时）：`codegraph_explore` 一次调用返回相关符号的逐行源码、调用链（含 grep 追不到的动态派发跳转）和影响面；查询里给出文件名或符号名即可读取其当前源码。若工具被延迟加载，按名称搜索加载。
- **命令行**（始终可用）：`codegraph explore "<符号名或问题>"` 输出相同内容。

若项目不存在 `.codegraph/` 目录，完全跳过 CodeGraph —— 是否建索引由用户决定。
<!-- CODEGRAPH_END -->

---

## CodeGraph 速查（本仓库）

### 环境现状

- CLI：`@colbymchenry/codegraph` v1.6.2，全局安装，命令在 PATH 中。
- 索引：`.codegraph/codegraph.db`（本地 SQLite，已被 `.gitignore` 忽略）；文件监听约 1 秒自动同步。
- CodeBuddy MCP：用户级 `~/.codebuddy/mcp.json` 的 `codegraph` 条目 → `codegraph serve --mcp`；`env.CODEGRAPH_MCP_TOOLS` 放开全部 8 个工具（需重启 IDE 生效）。已实测 `codegraph_explore` 无需 `--path` / `projectPath` 即可定位本仓库索引。
- 其它 Agent：`codegraph install --target=all --yes` 已接线（Claude Code、Cursor、Codex CLI、opencode、Hermes、Gemini CLI、Antigravity、Kiro、Copilot 三形态），需各自重启；Kiro 还需在设置里启用 MCP。
- 索引配置：项目根 `codegraph.json`，含 `exclude` / `include` / `includeIgnored` / `extensions` 四字段，当前均为空值，等价于零配置；改动后必须 `codegraph index`。

以上为安装时的快照，版本或接线变化后需同步更新本节。

### MCP 工具（8 个）

`CODEGRAPH_MCP_TOOLS` 是**替换式白名单**，不是追加，配置时必须列全：`explore,node,search,callers,callees,impact,files,status`。

- `explore`：主力，源码 + 调用链 + 影响面（几乎任何问题先调它）。
- `node`：单符号源码与调用/被调用链，或按行读取整个文件。
- `search`：按名查符号，只返回位置。
- `callers` / `callees` / `impact`：谁调用它 / 它调用谁 / 改动影响面。
- `files`：索引中的文件结构。
- `status`：索引健康与统计。

对应的 CLI 等价命令：`explore` / `node` / `query` / `callers` / `callees` / `impact` / `files` / `status`。

### 命令

```bash
codegraph version
codegraph upgrade [version]             # 自动 refresh 已接线的 Agent
codegraph install --yes [--init]
codegraph install --target=all --yes
codegraph install --print-config <id>   # 只打印配置，不写文件
codegraph uninstall                     # 撤销所有 Agent 接线，保留 .codegraph/

codegraph init [path]                   # 初始化并建全量索引
codegraph index [path]                  # 全量重建（改 codegraph.json 后必跑）
codegraph sync [path]                   # 增量同步
codegraph status [-j]                   # 状态与统计
codegraph uninit [path]                 # 删除 .codegraph/

codegraph explore <query...>            # 主力查询
codegraph context <task...>             # 为任务组装上下文
codegraph node [name] / query <search> / callers <symbol> / callees <symbol>
codegraph impact <symbol> / affected [files...] / files

codegraph serve --mcp [--path <dir>] [--no-watch]
codegraph daemon                        # 管理后台守护进程
codegraph unlock [path]                 # 清除陈旧锁文件
codegraph telemetry status|on|off
```

### 排错

- `Not initialized` → `codegraph init`。
- 索引落后，或改了 `codegraph.json` → `codegraph sync` / `codegraph index`。
- 锁文件阻塞 → `codegraph unlock`；守护进程卡住 → `codegraph daemon`。
- MCP 列不出工具 → 该项目没有 `.codegraph/`，先 `init`（无索引时 server 会声明 inactive）。
- MCP 报找不到项目 → 在 `args` 末尾补 `--path`, `E:/AI/mcp/agentX`（代价是全局配置绑定单项目），或在工具调用里传 `projectPath`。

### 索引配置字段

`codegraph.json` 为空时等价于零配置；有需求时按下列字段填写，改完必须 `codegraph index`：

```json
{
  "exclude": ["static/", "**/vendor/**"],
  "include": ["Tools/", "Local/typescript/"],
  "includeIgnored": ["packages/", "services/"],
  "extensions": {".dota_lua": "lua", ".tpl": "php"}
}
```

`exclude` 强制排除已跟踪目录；`include` 把 `.gitignore` 忽略的一手源码拉回索引；`includeIgnored` 索引被忽略目录里的嵌套 git 仓库；`extensions` 映射非标准扩展名。默认跳过 `node_modules` / `dist` / `vendor` 等目录、`.gitignore` 内容、大于 1 MB 的文件。