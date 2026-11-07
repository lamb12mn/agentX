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

当前基础模式注册 **66 次、65 个唯一工具名**（15 个注册模块）；增强模式追加 **38 个**，合计 **103 个**。

`export_agent` 同时定义在 `tools/agents.ts` 与 `tools/export.ts`；`src/index.ts` 按对象展开顺序合并且后者在后，因此**运行时生效的是 `tools/export.ts` 的实现**。

### 2.1 基础工具（65 个唯一名）

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
| `tools/evaluations.ts` | 5 | `create_evaluation_set`, `list_evaluation_sets`, `add_evaluation_sample`, `rate_evaluation_sample`, `evaluation_summary`（详见第 5 节） |
| `tools/export.ts` | 2 | `export_agent`, `export_all` |
| `tools/dependencies.ts` | 5 | `check_dependencies`, `get_dependents`, `get_dependencies`, `get_dependency_graph`, `detect_circular_dependency` |
| `tools/teams.ts` | 11 | `team.create`, `team.run`, `team.status`, `team.results`, `team.cancel`, `team.list`, `team.history`, `team.logs`, `team.approve`, `team.reject`, `team.pending` |

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

- `POST /api/workflows/execute` 固定返回 `status: 'not_implemented'`，尚未接入真实工作流执行引擎。
- `TeamEngine`（`src/orchestrator/team-engine.ts`）已具备 `AiProvider` 接口、模板渲染与执行会话持久化，但**未注入 AiProvider 时仍回退到 `stubAgentExecution()`**，输出带 `[Stub]` 前缀。
- REST API 需在增强模式下调用 `api.start`（或由 `main()` 自动启动）；未设置 `AGENTX_API_KEY` 时认证关闭，仅 `/health` 默认公开。
- `better-sqlite3` 是原生模块，切换 Node 主版本后须 `npm rebuild better-sqlite3`，否则 `initDb()` 会直接失败。

---

## 4. CLI 对照

`agentx` 共 **25 个顶层命令**（不含 `help`），由 `src/cli.ts` 注册，完整列表以 `agentx --help` 为准。

| 分组 | 命令 |
|---|---|
| 资产 | `list`, `get`, `create`, `delete`, `clone`, `search`, `info`, `validate`, `templates` |
| 导入导出 | `import`, `export`, `export-all`, `backup`, `restore` |
| 编排与团队 | `team`（create/run/status/results/cancel/list/history/logs/approve/reject/pending）, `graph` |
| 批量与 MCP | `batch`, `mcp`（send/inspect）, `proxy`, `init` |
| 运维 | `doctor`, `audit`, `vault`, `remote`（add/list/remove/pull/push）, `web` |

CLI 不读取 MCP 配置中的 `env`，需单独设置 `AGENTX_DIR` 才能与 MCP 实例访问同一份数据。

---

## 5. Prompt 评测工具

本地评测闭环：评测集绑定某个资产的**版本快照**，样本记录「提问 + 回答 + 评分结果」，
用于量化版本质量并驱动迭代。全程本地 SQLite 存储，不调用外部模型。

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
| `rate_evaluation_sample` | **sampleId**, score?, gsb?, feedback? | 更新后的 `EvaluationSample` |
| `evaluation_summary` | **setId** | `EvaluationSummary` |

返回结构：

- `EvaluationSet`：`id`, `asset_id`, `version`, `name`, `mode`, `description?`, `created_at`
- `EvaluationSample`：`id`, `set_id`, `question`, `variables`, `rendered_question`, `answer`, `ideal_answer?`, `reference_answer?`, `score?`, `gsb?`, `feedback?`, `created_at`
- `EvaluationSummary`：`setId`, `assetId`, `version`, `mode`, `total`, `rated`, `averageScore`（`gsb` 模式为 `null`）, `gsb: { good, same, bad }`

### 典型流程

1. `create_version_snapshot({ assetId })` → 得到 `version`
2. `create_evaluation_set({ assetId, version, name, mode: 'score' })` → 得到 `setId`
3. `add_evaluation_sample({ setId, question: '总结 {{topic}}', answer, variables: { topic: 'SQLite' } })` → 得到 `sampleId`
4. `rate_evaluation_sample({ sampleId, score: 4 })`
5. `evaluation_summary({ setId })` → 平均分与评分覆盖率；据此改进 Prompt 后创建新快照，重复 2-5

> 错误边界：`version` 不存在、模式不匹配、评分越界、未知 `setId` / `sampleId` 均抛出明确错误，由 MCP 层返回 `isError`。

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
| `AGENTX_API_PORT` | `3000` | REST API 端口 |
| `AGENTX_API_HOST` | `localhost` | REST API 监听地址 |
| `AGENTX_API_KEY` | 未设置 | 启用 REST API 认证 |
| `AGENTX_MONITOR_INTERVAL` | `5000` | 监控刷新间隔（ms） |

源码中其余变量：`AGENTX_HOME`、`AGENTX_LOG_LEVEL`、`AGENTX_MCP_ENV_ALLOW`、`AGENTX_MCP_MAX_MEMORY`、`AGENTX_MCP_TIMEOUT`、`AGENTX_OTEL_ENABLED`、`AGENTX_OTEL_ENDPOINT`、`AGENTX_OTEL_SAMPLE_RATE`、`AGENTX_OTEL_SERVICE_NAME`、`AGENTX_OTEL_SERVICE_VERSION`、`AGENTX_VAULT_DIR`、`AGENTX_VAULT_DISABLE_KEYCHAIN`、`AGENTX_VAULT_PASSPHRASE`。用途与默认值以对应模块源码为准。

---

## 8. 维护

增删工具或修改 `package.json` 后，同步更新本文、`README.md` 与 `CONTRIBUTING.md`，并运行：

```bash
node scripts/verify-docs.mjs
```

该脚本校验版本 / Node 徽章、工具数量、CLI 命令数与文档内所有本地 Markdown 链接。
