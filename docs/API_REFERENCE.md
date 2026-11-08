# AgentX API 参考

> 本文以 `agentx-mcp/src/index.ts`、`src/tools/*.ts`、`src/cli.ts`、`src/store/*.ts` 的实际代码为事实源。
> 完整工具清单与精确 `inputSchema` 以运行时 `tools/list` 为准；本文手工维护接口约定。
> 适用版本：2.0.1 · 更新日期：2026-11-07

---

## 1. 协议与调用

| 项 | 值 |
|---|---|
| 传输 | stdio JSON-RPC |
| Server | `{ name: 'agentx', version: '2.0.1' }` |
| 能力 | `tools`（无 resources / prompts） |
| 数据库 | 模块顶层执行 `initDb(getDbPath())`，路径 `$AGENTX_DIR/agentx.db`，默认 `~/.agentx/agentx.db` |
| 调用链 | `tools/call` → `traceToolCall()`（OpenTelemetry）→ `tool.handler(args)` |

**`tools/list` 响应**：`{ tools: [{ name, description, inputSchema }] }`，由 `Object.entries(allTools)` 生成；未声明 `inputSchema` 的工具回退为 `{ type: 'object' }`。

**`tools/call` 成功响应**：

```json
{
  "content": [{ "type": "text", "text": "{\n  \"...\": ...\n}" }]
}
```

`text` 是 `JSON.stringify(result, null, 2)` 的结果，客户端需再解析一次。

**失败响应**：`isError: true`，`text` 为 `src/utils/errors.ts` 的 `formatError()` 输出，含 `code`、`tool`、`suggestion`。未知工具返回 `INVALID_INPUT` 并附全部可用工具名；handler 抛错时统一返回 `ASSET_CREATE_FAILED`（该错误码对非创建类工具也复用，属当前实现的已知行为）。

**增强模式**：仅当 `AGENTX_ENHANCED=true` 时，`src/index.ts` 才懒加载 `plugins/`、`sync/`、`ai/`、`api/`、`monitoring/`、`ui/`、`editor/`、`store/cache.ts` 等模块，并注册第 2.2 节的 38 个工具；同时启动监控面板与 REST API。未启用时这些模块完全不加载。

---

## 2. 工具总览

当前基础模式注册 **80 次、79 个唯一工具名**（18 个注册模块）；增强模式追加 **38 个**，合计 **117 个**。`tools/list` 默认只暴露 27 个（25 个核心工具 + `match_tools` + `discover_tools`），详见 2.3 / 2.4 节。

`export_agent` 同时定义在 `tools/agents.ts` 与 `tools/export.ts`；`src/index.ts` 按对象展开顺序合并且后者在后，因此**运行时生效的是 `tools/export.ts` 的实现**。

### 2.1 基础工具（79 个唯一名）

| 注册模块 | 数量 | 工具名 |
|---|---|---|
| `tools/skills.ts` | 5 | `list_skills`, `get_skill`, `create_skill`, `update_skill`, `delete_skill` |
| `tools/prompts.ts` | 5 | `list_prompts`, `get_prompt`, `create_prompt`, `update_prompt`, `delete_prompt` |
| `tools/rules.ts` | 5 | `list_rules`, `get_rule`, `create_rule`, `update_rule`, `delete_rule` |
| `tools/mcps.ts` | 5 | `list_mcps`, `get_mcp`, `create_mcp`, `update_mcp`, `delete_mcp` |
| `tools/workflows.ts` | 5 | `list_workflows`, `get_workflow`, `create_workflow`, `update_workflow`, `delete_workflow` |
| `tools/agents.ts` | 6 | `list_agents`, `get_agent`, `create_agent`, `update_agent`, `delete_agent`, `export_agent` |
| `tools/search.ts` | 1 | `search_assets` |
| `tools/import.ts` | 1 | `import_from_claude` |
| `tools/batch.ts` | 3 | `batch_delete`, `batch_tag_add`, `batch_tag_remove` |
| `tools/clone.ts` | 1 | `clone_asset` |
| `tools/versions.ts` | 6 | `create_version_snapshot`, `list_versions`, `get_version`, `rollback_to_version`, `clear_versions`, `version_stats` |
| `tools/evaluations.ts` | 14 | `create_evaluation_set`, `list_evaluation_sets`, `add_evaluation_sample`, `add_evaluation_samples`, `list_evaluation_samples`, `rate_evaluation_sample`, `evaluation_summary`, `compare_evaluation_sets`, `suggest_prompt_improvements`, `apply_evaluation_dsl`, `ai_rate_evaluation_samples`, `ai_rewrite_prompt`, `ai_generate_evaluation_samples`, `apply_prompt_rewrite`（详见第 5 节） |
| `tools/export.ts` | 2 | `export_agent`, `export_all` |
| `tools/dependencies.ts` | 5 | `check_dependencies`, `get_dependents`, `get_dependencies`, `get_dependency_graph`, `detect_circular_dependency` |
| `tools/teams.ts` | 11 | `team.create`, `team.run`, `team.status`, `team.results`, `team.cancel`, `team.list`, `team.history`, `team.logs`, `team.approve`, `team.reject`, `team.pending` |
| `tools/catalog.ts` | 1 | `discover_tools`（见 2.3 节） |
| `tools/intent.ts` | 1 | `match_tools`（见 2.4 节） |
| `tools/builtin-prompts.ts` | 3 | `list_builtin_prompts`, `get_builtin_prompt`, `match_builtin_prompts`（见 2.5 节） |

> 六类资产的 CRUD 遵循 `list_* / get_* / create_* / update_* / delete_*` 命名约定。

### 2.2 增强工具（38 个，需 `AGENTX_ENHANCED=true`）

| 前缀 | 数量 | 工具名 |
|---|---|---|
| `cache.*` | 2 | `cache.getStats`, `cache.clear` |
| `system.*` | 1 | `system.stats` |
| `plugins.*` | 4 | `plugins.load`, `plugins.list`, `plugins.enable`, `plugins.disable` |
| `sync.*` | 5 | `sync.configure`, `sync.start`, `sync.stop`, `sync.status`, `sync.force` |
| `ai.*` | 4 | `ai.suggestions`, `ai.enable`, `ai.disable`, `ai.completion` |
| `api.*` | 3 | `api.start`, `api.stop`, `api.stats` |
| `monitor.*` | 4 | `monitor.start`, `monitor.stop`, `monitor.metrics`, `monitor.report` |
| `editor.*` | 6 | `editor.create`, `editor.nodes`, `editor.connections`, `editor.export`, `editor.svg`, `editor.autolayout` |
| `ui.mobile.*` | 3 | `ui.mobile.components`, `ui.mobile.breakpoint`, `ui.mobile.css` |
| `vault.*` | 6 | `vault.init`, `vault.store`, `vault.get`, `vault.list`, `vault.delete`, `vault.audit` |

> `vault.*` 工具定义在 `src/index.ts` 的增强块内（依赖 `src/security/`），因此同样只在增强模式下可用。

---

### 2.3 工具发现与分层暴露

`tools/list` 默认只返回 25 个高频工具 + 两个始终暴露的元工具 `match_tools` / `discover_tools`（共 27 个）。其余工具**仍注册、仍可按原名调用**，只是不出现在列表中；这既减少模型的选择负担与上下文占用，也不破坏既有脚本。启动诊断输出形如 `Tool exposure: core — 27/79 tools in tools/list`。

| 工具 | 参数 | 返回 |
|---|---|---|
| `discover_tools` | query?, group?, includeSchema?, limit?（1-100，默认 30） | `DiscoverResult`（按关键词 / 分组浏览） |
| `match_tools` | intent（必填）, args?, limit?（1-20，默认 5）, includeSchema?, group?, execute?, useAi? | `MatchResult`（见 2.4 节，按自然语言意图路由） |

- `query`：对工具名与描述做不区分大小写的子串匹配；`group`：只返回该分组（分组名取自注册模块，如 `evaluations` / `teams`；增强工具取 `.` 前缀，如 `vault`）；`includeSchema`：附带每个工具的 `inputSchema`。
- `DiscoverResult`：`profile`（`core` / `full` / `custom`）、`exposedCount`、`totalTools`、`groups[]`（各分组 `total` / `exposed`）、`tools[]`（`name` / `group` / `description` / `exposed` / 可选 `inputSchema`）、`hint`。

`AGENTX_TOOLS` 控制暴露范围（重启生效）：

| 取值 | 行为 |
|---|---|
| 未设置 / `core` | 25 个核心工具 + 2 个元工具 |
| `full` | 全部注册工具（增强模式下 117 个） |
| `core,apply_evaluation_dsl,team.create` | 核心集追加指定工具（元工具始终包含） |
| `list_skills,search_assets` | 仅暴露列出的工具（自动包含两个元工具） |

未知工具名在启动时输出 `[catalog] Unknown tool in AGENTX_TOOLS: <name>` 并跳过。核心集定义见 `src/tools/catalog.ts` 的 `CORE_TOOLS`，元工具定义见同文件 `META_TOOLS`；其名称有效性与 README 声明的默认暴露数由 `scripts/verify-docs.mjs` 校验。

### 2.4 意图路由（`match_tools`）

把自然语言请求映射为排序后的工具候选。实现位于 `src/tools/intent.ts`，**默认纯本地、零依赖、不调用模型**。

| 参数 | 类型 | 说明 |
|---|---|---|
| `intent` | string（必填） | 用户原话，中文或英文 |
| `args` | object | 已知参数，用于推导 `missing` 与自动执行 |
| `limit` | number | 候选数 1-20，默认 5 |
| `group` | string | 限定候选分组 |
| `includeSchema` | boolean | 附带 `inputSchema` |
| `execute` | boolean | 高置信只读匹配自动执行，默认 `false` |
| `useAi` | boolean | 用 `AGENTX_AI_API_KEY` 重排本地候选，默认 `false` |

**匹配算法**：`tokenizeIntent()` 用中英双语动作 / 对象词典把输入归一为概念 token；`rankTools()` 对工具名 token（经 `TOKEN_TO_CONCEPT` 反向归一，使 `version_stats` 能命中「统计 / statistics」）、描述 token 与分组加权打分 —— 动作命中 10 分、对象 8 分、描述 2 分、分组 3 分，精确工具名 +30，名称编辑距离相似度 ≥0.75 额外加分，动作冲突 −8；最终按分数排序并给出 `confidence`（`high` ≥20 / `medium` ≥10 / `low`）与 `reasons[]`。中文别名按长度降序匹配（`评测集` → `evaluation`，不拆成 `评测` + `集`）。

`MatchResult`：`intent`、`engine`（`local` / `local+ai`）、`autoSelect`、`selected?`、`matches[]`、`aiRerank?`、`executed?`、`refused?`、`hint`。
`IntentMatch`：`name` / `group` / `description` / `score` / `confidence` / `reasons[]` / `exposed` / `required[]` / `missing[]` / `callTemplate` / 可选 `inputSchema`。
`autoSelect` 条件：top1 ≥ 16 分且领先第二名 ≥ 4 分。

**安全边界**：

- `execute: true` 仅在 `autoSelect`、必填参数齐全、且工具命中只读白名单（`list_*` / `get_*` / `search_*` / `check_*` / `compare_*` / `detect_*` / `suggest_*` / `version_stats` / `evaluation_summary` / `team.status` 等）时真正调用，结果写入 `executed`；**写操作与元工具一律拒绝**，只返回 `callTemplate` 与 `refused`。执行器异常写入 `executed.error`，不丢弃匹配结果。
- `useAi: true` 时通过 `AiProvider` 对本地 top-10 候选重排，返回名必须落在候选集内；无 provider 抛 `AiProviderNotConfiguredError`（不静默伪造），provider 报错则降级本地并置 `aiRerank.status = 'failed'`。本地打分始终保留，AI 只改变顺序。
- `tools/call` 传入未知工具名时，错误 `suggestion` 会附上 `rankTools()` 的 top-3 候选，例如把 `list_promts` 纠正为 `list_prompts`。

### 2.5 内置提示词库

`src/builtin-prompts/garden-prompts.json` 收录 147 条内置提示词（`text` 25 / `image` 122，正文共 135,932 字符，来源 `https://garden.always200.com/`）。数据随 `dist/` 分发，与用户资产库隔离；运行时深冻结，且 `updateAsset` / `deleteAsset` 首行拒绝 `builtin:` 前缀与内置 slug，因此**不可修改、不可删除**。

| 工具 | 参数 | 说明 |
|---|---|---|
| `list_builtin_prompts` | type?, category?, limit? | 列举摘要与抓取统计 |
| `get_builtin_prompt` | id（必填） | 返回完整 `promptText` / `notes` / 参数 / 来源，以及可注入的参考块 |
| `match_builtin_prompts` | query（必填）, limit?, type?, category? | 本地加权匹配（标题 8 / 标签 5 / 分类 4 / 描述 3 / 正文 1），返回排序结果、`selected`、`reference` |

**自动调用**：`create_prompt` / `create_rule` / `create_agent` 的 `intent` 与 `update_prompt` 的 `optimizeIntent` 会在工具内部自动匹配并应用 top-1 内置提示词，返回 `matchedBuiltin`；显式 `content` 优先。这三个只读工具不参与 `match_tools` 意图路由竞争。

---

## 3. 通用约定

### 3.1 资产类型

`src/types.ts` 定义 7 种 `AssetType`：`skill | mcp | prompt | rule | workflow | agent | team`。
前 6 种可通过 `create_*` 工具或 `agentx create` 创建；`team` 由 `team.*` 工具内部读写，不开放给 `create`。

文件按 `{baseDir}/{type}s/{name}{ext}` 平铺存储，扩展名由 `src/store/assets.ts` 的 `fileExtension()` 决定：

| 类型 | 扩展名 | 目录 |
|---|---|---|
| `skill` / `prompt` / `rule` | `.md` | `skills/` `prompts/` `rules/` |
| `mcp` / `workflow` / `agent` / `team` | `.yaml` | `mcps/` `workflows/` `agents/` `teams/` |

### 3.2 参数与返回值

各工具的精确 `inputSchema` 请用 `tools/list` 获取。常见约定：

- 资产定位：`id`（uuid v4）或 `name`；`list_*` 支持 `type` / `tags` 过滤。
- 创建：`name`、`content`、`tags?`、`description?`；`createAsset(input, content, baseDir)` 是异步函数。
- `search_assets` 走 FTS5，返回带相关度的结果。
- 所有返回值均被序列化为 JSON 文本放进 `content[0].text`。

### 3.3 错误码（`src/utils/errors.ts`，26 个）

| 分类 | 错误码 |
|---|---|
| 资产（7） | `ASSET_NOT_FOUND`, `ASSET_ALREADY_EXISTS`, `ASSET_INVALID_NAME`, `ASSET_INVALID_TYPE`, `ASSET_CREATE_FAILED`, `ASSET_UPDATE_FAILED`, `ASSET_DELETE_FAILED` |
| 数据库（3） | `DB_NOT_INITIALIZED`, `DB_CONNECTION_FAILED`, `DB_QUERY_FAILED` |
| 文件（5） | `FILE_NOT_FOUND`, `FILE_READ_FAILED`, `FILE_WRITE_FAILED`, `FILE_PERMISSION_DENIED`, `FILE_INVALID_PATH` |
| 输入校验（5） | `INVALID_INPUT`, `MISSING_REQUIRED_FIELD`, `INVALID_FIELD_TYPE`, `FIELD_TOO_LONG`, `FIELD_TOO_SHORT` |
| 导入导出（4） | `IMPORT_FAILED`, `EXPORT_FAILED`, `INVALID_FORMAT`, `INVALID_CONTENT` |
| 搜索（2） | `SEARCH_FAILED`, `INVALID_QUERY` |

### 3.4 已知限制

- `POST /api/workflows/execute` 已接入 `src/orchestrator/workflow-runner.ts`：读取 workflow 资产的 YAML/JSON（支持完整 `TeamConfig`、`{ steps: [...] }` 或顶层步骤数组），由 `TeamEngine` 同步执行并返回完整结果。默认不写会话表，返回中的 `simulated` 标记是否走了本地 stub。
- `TeamEngine` 的执行优先级为 human → sub-team → agentHandler → `AiProvider` → `AIAssistant` → stub。设置 `AGENTX_AI_API_KEY`（可选 `AGENTX_AI_BASE_URL` / `AGENTX_AI_MODEL`）后，`createAiProviderFromEnv()` 会把真实 provider 注入 MCP / CLI / REST 三处；未配置时保留带 `simulated: true` 的 `[Stub]` 兜底，结果明确标记未做真实工作。
- AI 评测工具（`ai_rate_evaluation_samples` / `ai_rewrite_prompt` / `ai_generate_evaluation_samples`）在无 provider 时抛 `AiProviderNotConfiguredError`，不会静默伪造评分或样本；AI 改写只返回候选文本，只有显式调用 `apply_prompt_rewrite` 才会写回资产、创建版本快照并绑定新评测集。
- REST API 需在增强模式下调用 `api.start`（或由 `main()` 自动启动）；未设置 `AGENTX_API_KEY` 时认证关闭，仅 `/health` 默认公开。
- `better-sqlite3` 是原生模块，切换 Node 主版本后须 `npm rebuild better-sqlite3`，否则 `initDb()` 会直接失败。

---

## 4. CLI 对照

`agentx` 共 **26 个顶层命令**（不含 `help`），由 `src/cli.ts` 注册，完整列表以 `agentx --help` 为准。

| 分组 | 命令 |
|---|---|
| 资产 | `list`, `get`, `create`, `delete`, `clone`, `search`, `info`, `validate`, `templates` |
| 导入导出 | `import`, `export`, `export-all`, `backup`, `restore` |
| 编排与团队 | `team`（create/run/status/results/cancel/list/history/logs/approve/reject/pending）, `graph` |
| 批量与 MCP | `batch`, `mcp`（send/inspect）, `proxy`, `init` |
| 评测 | `evaluation`（snapshot/create/list/add-sample/add-samples/rate/samples/summary/compare/suggest/apply-dsl/ai-rate/ai-rewrite/ai-generate/apply-rewrite） |
| 运维 | `doctor`, `audit`, `vault`, `remote`（add/list/remove/pull/push）, `web` |

`evaluation` 组的 14 个子命令与第 5 节评测工具一一对应；`snapshot` 是纯 CLI 前置辅助命令（评测集要求版本快照已存在，此前该能力只有 MCP 工具 `create_version_snapshot`）。全组统一输出 JSON，且不调用 `process.exit()`（失败时打印错误并设置 `process.exitCode = 1`）。`ai-rate` / `ai-rewrite` / `ai-generate` 需要 `AGENTX_AI_API_KEY`，未配置时直接报错；`apply-rewrite` 传入候选文本或候选 JSON 文件时可完全离线：

| 子命令 | 位置参数 | 主要选项 | 对应工具 |
|---|---|---|---|
| `snapshot` | `<assetId>` | — | `create_version_snapshot`（仅 CLI 辅助） |
| `create` | `<assetId> <version> <name>` | `--mode score\|gsb`（默认 score）, `--description` | `create_evaluation_set` |
| `list` | `<assetId>` | `--version` | `list_evaluation_sets` |
| `add-sample` | `<setId> <question> <answer>` | `--variables <json>`, `--ideal`, `--reference`, `--feedback` | `add_evaluation_sample` |
| `add-samples` | `<setId> <question> <file>` | 文件为样本 JSON 数组 | `add_evaluation_samples` |
| `rate` | `<sampleId>` | `--score 1-5` 或 `--gsb good\|same\|bad`, `--feedback` | `rate_evaluation_sample` |
| `samples` | `<setId>` | `--rated`, `--unrated`, `--max-score`, `--gsb`, `--limit` | `list_evaluation_samples` |
| `summary` | `<setId>` | — | `evaluation_summary` |
| `compare` | `<baselineSetId> <candidateSetId>` | — | `compare_evaluation_sets` |
| `suggest` | `<setId>` | `--max-score`, `--limit` | `suggest_prompt_improvements` |
| `apply-dsl` | `<setId> <file>` | `--dry-run`, `--limit`, `--overwrite` | `apply_evaluation_dsl` |
| `ai-rate` | `<setId>` | `--limit`, `--overwrite`, `--model`, `--timeout` | `ai_rate_evaluation_samples` |
| `ai-rewrite` | `<setId>` | `--max-score`, `--limit`, `--model`, `--timeout`, `--instructions` | `ai_rewrite_prompt` |
| `ai-generate` | `<setId>` | `--count`, `--question`, `--no-answers`, `--dry-run`, `--model`, `--timeout`, `--instructions` | `ai_generate_evaluation_samples` |
| `apply-rewrite` | `<setId> [file]` | `--rewritten-prompt`, `--dry-run`, `--name`, `--description`, `--max-score`, `--limit`, `--model`, `--timeout`, `--instructions` | `apply_prompt_rewrite` |

CLI 不读取 MCP 配置中的 `env`，需单独设置 `AGENTX_DIR` 才能与 MCP 实例访问同一份数据。

---

## 5. Prompt 评测工具

本地评测闭环：评测集绑定某个资产的**版本快照**，样本记录「提问 + 回答 + 评分结果」，
用于量化版本质量并驱动迭代。默认全程本地 SQLite 存储、不调用外部模型：
`apply_evaluation_dsl` 用本地规则自动打分，`suggest_prompt_improvements` 用规则诊断。
只有 `ai_rate_evaluation_samples` / `ai_rewrite_prompt` / `ai_generate_evaluation_samples`
会调用外部模型，且必须设置 `AGENTX_AI_API_KEY`；未配置时抛
`AiProviderNotConfiguredError`，不会静默伪造结果。`apply_prompt_rewrite` 是本地写操作：
显式传入候选文本时不调用模型。

- 表：`evaluation_sets`、`evaluation_samples`（由 `initDb` 幂等创建）
- 版本：复用 `versions` 表，需先调用 `create_version_snapshot`
- 变量：提问中的 `{{变量名}}` 由 `variables` 本地渲染为 `rendered_question`；缺失变量保留原占位符

### 评测模式

| `mode` | 评分字段 | 汇总指标 |
|--------|----------|----------|
| `score` | `score`：1-5 整数 | `averageScore`、`rated` |
| `gsb` | `gsb`：`good` / `same` / `bad`（相对 `referenceAnswer`） | `gsb` 分布、`rated` |

两种模式互斥：`score` 模式传 `gsb` 会报错，`gsb` 模式传 `score` 会报错。
不同版本的评测集相互独立。

### 接口

| 工具 | 入参（必填加粗） | 返回 |
|------|------------------|------|
| `create_evaluation_set` | **assetId**, **version**, **name**, **mode**, description? | `EvaluationSet` |
| `list_evaluation_sets` | **assetId**, version? | `EvaluationSet[]` |
| `add_evaluation_sample` | **setId**, **question**, **answer**, variables?, idealAnswer?, referenceAnswer?, feedback? | `EvaluationSample` |
| `add_evaluation_samples` | **setId**, **question**, **samples**[ ] | `EvaluationSample[]`（单事务） |
| `list_evaluation_samples` | **setId**, rated?, maxScore?, gsb?, limit? | `EvaluationSample[]` |
| `rate_evaluation_sample` | **sampleId**, score?, gsb?, feedback? | 更新后的 `EvaluationSample` |
| `evaluation_summary` | **setId** | `EvaluationSummary` |
| `compare_evaluation_sets` | **baselineSetId**, **candidateSetId** | `EvaluationComparison` |
| `suggest_prompt_improvements` | **setId**, maxScore?, limit? | `ImprovementReport` |
| `apply_evaluation_dsl` | **setId**, **dsl**, dryRun?, limit?, overwrite? | `DslApplicationResult` |
| `ai_rate_evaluation_samples` | **setId**, limit?, overwrite?, model?, timeout? | `AiRateResult` |
| `ai_rewrite_prompt` | **setId**, maxScore?, limit?, model?, timeout?, extraInstructions? | `AiRewriteResult` |
| `ai_generate_evaluation_samples` | **setId**, count?, question?, generateAnswers?, dryRun?, model?, timeout?, instructions? | `AiGenerateSamplesResult` |
| `apply_prompt_rewrite` | **setId**, rewrittenPrompt?, maxScore?, limit?, model?, timeout?, extraInstructions?, name?, description?, dryRun? | `ApplyRewriteResult` |

`add_evaluation_samples` 的 `samples[]` 每项含必填 `answer`，可选 `variables`、`idealAnswer`、`referenceAnswer`、`feedback`；共用一个 `question` 种子模板，逐条渲染 `{{变量}}`，同一事务写入，任一失败整批回滚，空列表报错。
`list_evaluation_samples` 默认最多返回 100 条，按录入顺序稳定排列；`maxScore` 仅用于 `score` 模式（取 `score <= maxScore` 的低分样本），`gsb` 仅用于 `gsb` 模式，混用会报错；`rated: true|false` 分别取已评分 / 未评分样本。

返回结构：

- `EvaluationSet`：`id`, `asset_id`, `version`, `name`, `mode`, `description?`, `created_at`
- `EvaluationSample`：`id`, `set_id`, `question`, `variables`, `rendered_question`, `answer`, `ideal_answer?`, `reference_answer?`, `score?`, `gsb?`, `feedback?`, `created_at`
- `EvaluationSummary`：`setId`, `assetId`, `version`, `mode`, `total`, `rated`, `averageScore`（`gsb` 模式为 `null`）, `gsb: { good, same, bad }`
- `EvaluationComparison`：`baseline`, `candidate`（均为 `EvaluationSummary`）, `averageScoreDelta`（仅 `score` 模式）, `gsbNetDelta`（仅 `gsb` 模式，净胜率 `(good - bad) / rated` 之差）, `ratedCoverageDelta`（评分覆盖率差）, `improved`（有评分时按对应模式的差值是否 > 0 判定，否则 `null`）
- `ImprovementReport`：`setId`, `assetId`, `version`, `mode`, `threshold`（`score` 模式为低分阈值，默认 2；`gsb` 模式为 `null`）, `total`, `weakSampleCount`, `weakSampleIds`（受 `limit` 截断，默认 20）, `insights[]`
- `DslApplicationResult`：`setId`, `mode`, `evaluated`（检查样本数）, `matched`（命中规则或 default 的数）, `written`（实际写回数）, `dryRun`, `decisions[]`（`sampleId`, `ruleIndex` — 命中规则下标，default 为 `null`, `score?` / `gsb?`, `feedback?`）
- `AiRateResult`：`setId`, `mode`, `evaluated`, `rated`, `failed`, `results[]`（`sampleId` + 评分）, `errors[]`（`sampleId`, `error`）
- `AiRewriteResult`：`setId`, `assetId`, `version`, `mode`, `currentPrompt`, `rewrittenPrompt`, `rationale`, `weakSampleCount`, `weakSampleIds`, `insightCodes`, `applied`（恒为 `false`）
- `AiGenerateSamplesResult`：`setId`, `mode`, `question`, `variableKeys`, `requested`, `generated`, `created`, `dryRun`, `samples[]`（`variables`, `renderedQuestion`, `answer`）, `errors[]`
- `ApplyRewriteResult`：`baselineSetId`, `assetId`, `previousVersion`, `rewrittenPrompt`, `rationale`, `version`（`dryRun` 为 `null`）, `evaluationSetId`（`dryRun` 为 `null`）, `applied`

`compare_evaluation_sets` 要求两个评测集属于**同一资产**且**模式一致**，否则报错；任一侧无有效评分时不臆断结论，`improved` 返回 `null`。

`suggest_prompt_improvements` 是**纯规则诊断**，不调用外部模型：`score` 模式取 `score <= maxScore`（默认 2）的样本为弱样本，`gsb` 模式取 `gsb === 'bad'`；`maxScore` 仅用于 `score` 模式且必须为 1-5 整数，`limit` 必须为正整数。每条 `insight` 含 `code` / `message` / `sampleIds`，按固定顺序输出：

| `code` | 触发条件 | 建议方向 |
|---|---|---|
| `weak_samples` | 存在弱样本 | 补充 few-shot 或明确输出约束；GSB 模式对照参照回答 |
| `unrated_samples` | 存在未评分样本 | 先完成评分再下结论 |
| `unresolved_variables` | 弱样本的 `rendered_question` 仍含 `{{变量}}` | 补齐缺失的变量取值 |
| `missing_reference_answer` | 弱样本缺 `idealAnswer` / `referenceAnswer` | 补参照答案，让改写目标可度量 |
| `weak_sample_feedback` | 弱样本带 `feedback` | 按反馈原文修订 |
| `variable_concentration` | 某变量取值在弱样本中出现 ≥ 2 次且占比 ≥ 50% | 针对该取值定向补样例 |

无弱样本且无未评分样本时 `insights` 为空数组。

### 本地评分 DSL（`apply_evaluation_dsl`）

`dsl` 为有序规则集 + 可选 `default`，**首条命中规则生效**；命中结果按评测集模式写入 `score`（1-5 整数）或 `gsb`：

```json
{
  "default": { "score": 3 },
  "rules": [
    { "when": "len(answer) < 40", "score": 1, "feedback": "回答过短" },
    { "when": "(answer contains 'SQLite' or answer contains 'WAL') and len(answer) >= 40", "score": 5 }
  ]
}
```

- 条件语法：`field op value` 子句用 `and` / `or` 连接，可用 `()` 分组（`and` 优先级高于 `or`）；多词取值需加引号，引号内的空格及 `and` / `or` 字样不会被误切。例：`"(answer contains 'SQLite' or answer contains 'WAL') and len(answer) >= 40"`。
- 可用字段：`answer`、`question`、`rendered_question`、`ideal_answer`、`reference_answer`、`feedback`、`score`、`gsb`、`rated`、`variables.<key>`、`len(<field>)`。
- 操作符：`=` `!=` `>` `>=` `<` `<=` `contains` `!contains`；数值比较遇非数值返回 `false`。
- 默认只处理**未评分**样本（`overwrite: true` 可重评）；`limit` 为 1-1000（默认 100）；`dryRun: true` 只返回决策、不写库。
- 规则 / `default` 的评分字段必须与 `mode` 一致，否则在取样前报错；无规则命中且无 `default` 时该样本跳过。

### 可选 AI 能力

三个 `ai_*` 工具共用 `AiProvider`（`src/ai/provider.ts`），由 `AGENTX_AI_API_KEY` 及可选 `AGENTX_AI_BASE_URL` / `AGENTX_AI_MODEL` 构造 OpenAI 兼容客户端（内置 `fetch`，无新依赖）。**未配置时抛 `AiProviderNotConfiguredError`**，绝不静默使用 stub。

| 工具 | 行为 | 失败处理 |
|---|---|---|
| `ai_rate_evaluation_samples` | 对未评分样本逐条请求评分，校验后写入 `rateEvaluationSample`；默认最多 20 条 | 单条响应非 JSON / 分数越界 / 缺字段时记入 `errors[]` 并跳过，不影响其他样本 |
| `ai_rewrite_prompt` | 汇总弱样本、`insights`、当前 Prompt 与评分概况，产出 `rewrittenPrompt` + `rationale` | 响应缺 `rewrittenPrompt` 时抛错；**不写回资产**，`applied` 恒为 `false` |
| `ai_generate_evaluation_samples` | 以种子样本的 `question` 为模板，请模型批量生成 `{{变量}}` 取值；本地渲染后以版本快照的 Prompt 作为 system、渲染提问作为 user 跑出回答，单事务写入新样本 | 模板无变量 / `count` 越界 / 无种子且未给 `question` 时抛错；占位符未解析、变量重复、单条回答失败时记入 `errors[]` 并跳过，不影响其余样本；`dryRun` 只返回候选 |

`ai_generate_evaluation_samples` 的 `count` 为 1-20（默认 5），`generateAnswers: false` 时只生成变量、回答留空；新样本一律**未评分**，需再走评分流程。`apply_prompt_rewrite` 是闭环收尾的本地写操作：传入 `rewrittenPrompt` 时完全离线，省略时先调用 `ai_rewrite_prompt`（需要 provider）；它依次更新资产内容、创建版本快照、创建绑定到新版本的评测集，`dryRun` 三者都不执行，返回中 `applied` 明确标记是否落盘。

`suggest_prompt_improvements` 与 `apply_evaluation_dsl` 始终为纯本地规则，不生成新的 Prompt 文本。

### 典型流程（本地闭环 + 可选 AI 回流）

1. `create_version_snapshot({ assetId })` → 得到 `version`
2. `create_evaluation_set({ assetId, version, name, mode: 'score' })` → 得到 `setId`
3. `add_evaluation_samples({ setId, question: '总结 {{topic}}', samples: [{ answer, variables: { topic: 'SQLite' } }, ...] })` → 由种子提问批量构建评测数据集；可选 `ai_generate_evaluation_samples({ setId, count: 5 })` 从种子自动扩充变量与回答
4. 评分三选一或组合：`rate_evaluation_sample` 逐条 / `apply_evaluation_dsl` 本地规则批量 / `ai_rate_evaluation_samples` 可选 AI 批量
5. `list_evaluation_samples({ setId, maxScore: 2 })` → 聚焦低分样本明细
6. `suggest_prompt_improvements({ setId })` + 可选 `ai_rewrite_prompt({ setId })` → 规则诊断与候选改写文本（不自动写回）
7. `apply_prompt_rewrite({ setId, rewrittenPrompt })`（或省略候选让 AI 生成）→ 一步完成资产改写、新版本快照、新评测集；返回 `evaluationSetId`，重复 3-4 完成新版本评测
8. `compare_evaluation_sets({ baselineSetId, candidateSetId })` → 判定新版本平均分 / GSB 净胜率是否提升，决定是否采纳

> 默认路径全程本地 SQLite、本地渲染与规则诊断，不调用外部模型；只有显式调用三个 `ai_*` 工具且配置了 `AGENTX_AI_API_KEY` 时才会产生模型请求。AI 不会自动改写资产、不会自动创建新版本——这两件事只在显式调用 `apply_prompt_rewrite` 时发生。
> 错误边界：`version` 不存在、模式不匹配、评分越界、DSL 语法或字段非法、AI provider 未配置、资产/模式不一致、未知 `setId` / `sampleId` 均抛出明确错误，由 MCP 层返回 `isError`。

---

## 6. 数据存储

SQLite（`better-sqlite3`，WAL 模式），`src/store/db.ts` 在 `initDb()` 中建表：

| 表 | 用途 |
|---|---|
| `assets` | 资产元数据（`id`/`type`/`name`/`description`/`tags`/`file_path`/时间戳） |
| `dependencies` | 资产间依赖关系（唯一约束 `asset_id + depends_on_id`） |
| `versions` | 版本快照 |
| `batch_operations` | 批量操作审计日志 |
| `sync_tracking` | 云同步状态 |
| `assets_fts` | FTS5 虚表，由 insert / update / delete 三个触发器维护 |
| `execution_sessions`, `execution_steps` | 团队执行会话持久化（`store/executions.ts` 幂等迁移） |
| `evaluation_sets`, `evaluation_samples` | Prompt 评测（`store/evaluations.ts` 幂等迁移） |

索引：`idx_assets_type`、`idx_assets_name`、`idx_dependencies_*`、`idx_versions_asset`、`idx_sync_tracking_status`。

---

## 7. 环境变量

常用变量（默认值见 `src/index.ts` / `src/cli/common.ts`）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AGENTX_DIR` | `~/.agentx` | 数据根目录 |
| `AGENTX_ENHANCED` | `false` | 启用增强模块与工具 |
| `AGENTX_TOOLS` | `core` | `tools/list` 暴露范围：`core` / `full` / 逗号分隔工具名（见 2.3 节）；`META_TOOLS` 始终暴露 |
| `AGENTX_API_PORT` | `3000` | REST API 端口 |
| `AGENTX_API_HOST` | `localhost` | REST API 监听地址 |
| `AGENTX_API_KEY` | 未设置 | 启用 REST API 认证 |
| `AGENTX_MONITOR_INTERVAL` | `5000` | 监控刷新间隔（ms） |
| `AGENTX_AI_API_KEY` | 未设置 | 为 `TeamEngine`、`ai_*` 评测工具及 `match_tools({ useAi: true })` 注入 OpenAI 兼容 provider；未设置时保持纯本地 |
| `AGENTX_AI_BASE_URL` | `https://api.openai.com/v1` | 任意 OpenAI 兼容端点 |
| `AGENTX_AI_MODEL` | `gpt-4o-mini` | 默认模型；单个工具可用 `model` 参数覆盖 |

源码中其余变量：`AGENTX_HOME`、`AGENTX_LOG_LEVEL`、`AGENTX_MCP_ENV_ALLOW`、`AGENTX_MCP_MAX_MEMORY`、`AGENTX_MCP_TIMEOUT`、`AGENTX_OTEL_ENABLED`、`AGENTX_OTEL_ENDPOINT`、`AGENTX_OTEL_SAMPLE_RATE`、`AGENTX_OTEL_SERVICE_NAME`、`AGENTX_OTEL_SERVICE_VERSION`、`AGENTX_VAULT_DIR`、`AGENTX_VAULT_DISABLE_KEYCHAIN`、`AGENTX_VAULT_PASSPHRASE`。用途与默认值以对应模块源码为准。

---

## 8. 维护

增删工具或修改 `package.json` 后，同步更新本文、`README.md` 与 `CONTRIBUTING.md`，并运行：

```bash
node scripts/verify-docs.mjs
```

该脚本共 16 项校验：版本 / Node 徽章、工具数量与逐项覆盖、分组计数之和、CLI 命令数与文档表格、API 参考工具清单、AI 环境变量覆盖、工作流实现与文档一致、文档内所有本地 Markdown 链接，核心集与元工具名称有效性、README 默认暴露数一致性，以及意图路由的文档覆盖与「写操作不进入只读白名单」静态防线。
