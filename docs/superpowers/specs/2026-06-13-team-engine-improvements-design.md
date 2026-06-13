# Team Engine 功能改进 — 设计文档

**日期:** 2026-06-13
**状态:** 待审批

---

## 1. 概述

在现有的 Team Engine Phase 1（顺序管道、重试、超时、事件）基础上，分三阶段进行功能改进。

**当前限制：**
- 所有 agent 执行为 stub/占位符，不真正调用 AI
- `condition` / `input_template` / `TeamVariable` 已定义但未实现
- Session 仅存在于内存中，重启丢失
- 无可观测性、无审计、无 webhook
- 仅支持顺序执行，不支持并行/分支/嵌套

---

## 2. Phase A — 核心功能补完

### 2.1 真实 AI 代理委托

**现状：** `executeSingleStep()` 是 stub，产生 `[Stub] Agent "X" processed input...` 占位输出。

**改进：**

```
TeamEngine.execute()
  → prepareStepInput()
  → resolveAgentConfig(agent_ref)  // 从 DB 加载 AgentConfig
  → 构造完整消息 (系统提示 + 上下文)
  → 调用 AI provider (兼容模式)
      ├─ OpenAI/Anthropic API (最佳)
      ├─ AIAssistant.executeAgent() (备选)
      └─ stub (fallback，无 AI 可用时)
  → parseOutput()
  → 返回 StepResult
```

**关键设计：**
- 新增 `AiProvider` 接口（支持 OpenAI / Anthropic / Ollama），通过 `src/index.ts` 的配置注入
- `AIAssistant` 作为默认 fallback（当前已有的模拟执行）
- 保留 `agentHandler` override 机制供测试使用
- AgentConfig 中的 `role_prompt` + `rules` + `skills` 拼接为 system message

```typescript
export interface AiProvider {
  execute(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { timeout?: number; model?: string }
  ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }>;
}
```

### 2.2 条件分支 (`condition`)

**现状：** `TeamWorkflowStep.condition` 定义了字段但从未评估。

**改进：** 在 `buildPipeline()` 中增加条件评估。支持两种模式：

1. **简单模式：** `condition` 为字符串表达式，如 `"output.research_complete === true"`，使用安全的表达式求值
2. **进阶模式：** `condition` 为函数引用或 DSL

```typescript
// 简单条件示例
{
  from: 'researcher',
  to: 'reviewer',
  condition: 'output.confidence >= 0.8'
}

// 若条件不满足，该 step 标记为 'skipped'，不执行 agent
```

**实现方式：** 使用 `vm.Script` 沙箱或简单 JSONPath 匹配（避免 eval 安全风险）。

### 2.3 输入模板渲染 (`input_template`)

**现状：** `TeamWorkflowStep.input_template` 定义了字段但未渲染。

**改进：** 使用简单 Mustache 风格模板：`{{variable}}` 从 `aggregatedOutput` 和 `globalInput` 中取值。

```typescript
// 输入模板示例
{
  from: 'researcher',
  to: 'writer',
  input_template: '基于以下研究结果撰写报告：\n\n研究方向：{{input.topic}}\n研究发现：{{output.research_summary}}\n置信度：{{output.confidence}}'
}
```

**实现：** 轻量级 `renderTemplate(template: string, context: Record<string, unknown>): string` 工具函数，支持点号路径访问（`input.topic`、`output.summary`）。

### 2.4 变量映射 (`TeamVariable`)

**现状：** `TeamVariable` 接口已定义，`step.input` 仅由 `prepareStepInput()` 粗粒度合并。

**改进：** 在 `prepareStepInput()` 中处理 `config.variables`，将全局输入或前一步输出的指定字段映射到当前 agent 的输入。

```typescript
// 变量映射示例
variables: [
  { name: 'user_query', source: 'input', field: 'query' },
  { name: 'research_data', source: 'step_output', step_role: 'researcher', field: 'findings' },
]
```

**优先级规则：** `variables` 显式映射 > `input_template` 渲染 > 默认合并

---

## 3. Phase C — 生产就绪

### 3.1 Session 持久化

**现状：** `Map<sessionId, ExecutionState>` 在内存中，进程重启后丢失。

**改进：** 将 execution state 持久化到 SQLite `execution_sessions` 表。

```sql
CREATE TABLE IF NOT EXISTS execution_sessions (
  session_id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL,
  team_config TEXT NOT NULL,         -- JSON
  status TEXT NOT NULL DEFAULT 'running',
  input TEXT,                        -- JSON
  aggregated_output TEXT,            -- JSON
  total_duration_ms INTEGER,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  errors TEXT                        -- JSON array
);

CREATE TABLE IF NOT EXISTS execution_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES execution_sessions(session_id),
  role TEXT NOT NULL,
  agent_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  input TEXT,                         -- JSON
  output TEXT,                        -- JSON
  error TEXT,
  retries INTEGER DEFAULT 0,
  duration_ms INTEGER,
  step_index INTEGER NOT NULL,
  started_at INTEGER NOT NULL
);
```

**行为变化：**
- `execute()` 启动时写入 `execution_sessions` 行
- 每步完成时写入 `execution_steps` 行
- 执行完成时更新 `execution_sessions` 的 `status`/`aggregated_output`/`completed_at`
- 进程重启后 `getStatus()` / `getResults()` 可从 DB 恢复

### 3.2 可观测性集成

**现状：** 使用裸 `EventEmitter`，没有结构化日志或链路追踪。

**改进：** 接入已有的 `observability/logger.ts` 和 `observability/tracing.ts`。

```typescript
import { createLogger } from '../observability/logger.js';
const logger = createLogger({ module: 'team-engine' });

// 关键埋点
logger.info('team.execution.start', { teamName, sessionId, stepCount });
logger.info('team.step.start', { sessionId, role, stepIndex });
logger.info('team.step.complete', { sessionId, role, durationMs });
logger.warn('team.step.retry', { sessionId, role, attempt, error });
logger.error('team.step.failed', { sessionId, role, error });
logger.info('team.execution.complete', { sessionId, status, totalDurationMs });
```

**追踪：** 为每次 `execute()` 创建一个 trace span，每个 step 创建一个子 span。

### 3.3 Webhook 回调

**新增功能：** `TeamConfig` 增加可选 `webhook` 字段。

```typescript
interface TeamConfig {
  // ... 现有字段
  webhook?: {
    url: string;
    events: ('start' | 'step.complete' | 'step.failed' | 'complete' | 'all')[];
    headers?: Record<string, string>;
  };
}
```

执行关键节点 POST JSON 负载到指定 URL。

### 3.4 审计日志 & 执行历史

**新增工具和 CLI：**

- `team.history` — 列出所有历史执行记录（分页）
- `team.logs <sessionId>` — 获取某次执行的详细步骤日志
- **CLI:** `agentx team history` / `agentx team logs <sessionId>`

### 3.5 并发限制

**新增配置：** 在构造函数或全局配置中增加并发控制。

```typescript
export class TeamEngine extends EventEmitter {
  constructor(options?: { maxConcurrent?: number; aiProvider?: AiProvider; logger?: Logger }) {}
}
```

默认 `maxConcurrent = 5`，超限时返回错误而非排队（避免复杂度）。

---

## 4. Phase B — 全功能工作流引擎

### 4.1 DAG 执行 & 并行

**现状：** `buildPipeline()` 返回严格顺序列表。

**改进：** 将工作流解析为 DAG（有向无环图），自动推导并行度。

```typescript
// 示例 DAG 工作流
{
  workflow: [
    { from: 'researcher', to: 'writer' },      // 顺序
    { from: 'researcher', to: 'fact_checker' }, // 与 writer 并行
    { from: 'writer', to: 'reviewer' },
    { from: 'fact_checker', to: 'reviewer' },
  ]
}

// 执行拓扑:
//          ┌→ writer ─┐
// researcher ┤          ├→ reviewer
//          └→ fact_checker ┘
//
// Step 1: researcher (单个)
// Step 2: writer + fact_checker (并行)
// Step 3: reviewer (单个，等前两个完成)
```

**实现：**
- `buildDag(workflow)` → 拓扑排序，计算入度
- `executeDag()` → 维护就绪队列，并行执行入度为 0 的节点
- 所有依赖完成后再推进下游
- 最大并行数受 `maxConcurrent` 限制

### 4.2 动态路由

在 `workflow` 步骤中支持基于上一步输出的条件路由。

```typescript
{
  workflow: [
    { from: 'classifier', to: 'writer',        condition: 'output.type === "article"' },
    { from: 'classifier', to: 'coder',          condition: 'output.type === "code"' },
    { from: 'classifier', to: 'analyst',        condition: 'output.type === "data"' },
    { from: 'writer', to: 'reviewer' },
    { from: 'coder', to: 'reviewer' },
    { from: 'analyst', to: 'reviewer' },
  ]
}
```

**实现：** DAG 变体，条件不满足的边被跳过，不影响其他路径的执行。

### 4.3 人工审批节点

引入特殊的 `human` agent 类型，暂停工作流等待外部确认。

```typescript
interface TeamAgent {
  // ... 现有字段
  agent_type?: 'ai' | 'human';  // 默认为 'ai'
  approval_required?: boolean;
  approval_timeout?: number;     // 审批超时(ms)
}
```

**工作流：**
1. 工作流执行到 `agent_type: 'human'` 的步骤
2. 引擎暂停，emit `awaitingApproval` 事件
3. 外部通过 `team.approve(sessionId, data)` 或 `team.reject(sessionId, reason)` 继续
4. 超时未审批 → 标记为 `'failed'` 或 `'skipped'`

**MCP 工具新增：**
- `team.approve` — 传入审批数据
- `team.reject` — 传入拒绝理由
- `team.pending` — 列出所有待审批的执行

### 4.4 嵌套团队

支持工作流的一个步骤引用另一个团队作为子流程。

```typescript
interface TeamWorkflowStep {
  // ... 现有字段
  sub_team?: TeamConfig;  // 内联子团队配置，或引用已有 team asset
}
```

执行到该步骤时，递归调用 `TeamEngine.execute()`，子团队结果作为该步骤的 output。

---

## 5. 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TeamEngine (EventEmitter)                   │
│                                                                     │
│  ┌─────────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  Workflow Executor  │  │  Step Executor   │  │  State Store  │  │
│  │  - sequential       │  │  - AiProvider    │  │  - in-memory  │  │
│  │  - dag              │  │  - retry/timeout │  │  - SQLite     │  │
│  │  - conditional      │  │  - template      │  │               │  │
│  │  - parallel         │  │  - variables     │  │               │  │
│  └─────────┬───────────┘  └────────┬─────────┘  └───────┬───────┘  │
│            │                       │                     │          │
│            ▼                       ▼                     ▼          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                Observability (Logger + Tracing)              │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                       │
         ▼                    ▼                       ▼
  MCP Tools (5→10)     CLI Commands (4→7)       Webhook Callbacks
  team.create          agentx team create        POST → external API
  team.run             agentx team run
  team.status          agentx team status
  team.results         agentx team results
  team.cancel          agentx team cancel
  team.history         agentx team history   [Phase C]
  team.approve         agentx team approve   [Phase B]
  team.reject          agentx team pending
  team.pending
```

---

## 6. 文件变更清单

| 文件 | A | C | B |
|------|---|---|---|
| `src/types.ts` | 修改 `TeamConfig`/`TeamWorkflowStep` | 无 | 修改 `TeamAgent`/`TeamWorkflowStep` |
| `src/orchestrator/team-engine.ts` | 大幅修改 (AI/condition/template/variable) | 大幅修改 (persist/log) | 大幅修改 (DAG/parallel/approval) |
| `src/orchestrator/index.ts` | 更新导出 | 更新导出 | 更新导出 |
| `src/tools/teams.ts` | 小幅修改 | 新增 `team.history`/`team.logs` | 新增 `team.approve`/`team.reject`/`team.pending` |
| `src/cli/commands/team.ts` | 小幅修改 | 新增 history/logs | 新增 approve/reject/pending |
| `src/index.ts` | 修改配置注入 | 无 | 无 |
| `src/ai/provider.ts` | **新建** — AiProvider 接口 | 无 | 无 |
| `src/orchestrator/template.ts` | **新建** — 模板渲染 | 无 | 无 |
| `src/store/db.ts` | 无 | 新增 execution 表迁移 | 无 |
| `src/store/executions.ts` | 无 | **新建** — session DB 操作 | 无 |
| tests | 更新 + 新增 | 新增 | 新增 |

**估算总代码量：** ~900 LOC 新增，~300 LOC 修改

---

## 7. 测试策略

### Phase A 测试重点
- AI provider 调用（mock provider）
- `condition` 评估（true/false/skip）
- `input_template` 渲染（简单/嵌套变量）
- `TeamVariable` 映射（input source / step_output source）
- 向后兼容：现有测试无需修改

### Phase C 测试重点
- DB 读写 + 恢复
- Logger 调用验证（mock logger）
- Webhook 调用验证（mock HTTP）
- 并发限制验证

### Phase B 测试重点
- DAG 拓扑排序（多种拓扑）
- 并行执行（验证并发数 + 顺序正确性）
- 动态路由（条件路由走不同分支）
- 人工审批（暂停 → approve → 继续 / 超时）
- 嵌套团队（递归执行 + 结果合并）

---

## 8. 成功标准

| 标准 | 测量方式 |
|------|---------|
| AI 代理实际执行并返回有意义结果 | `team.run` 输出不再是 `[Stub]` 前缀 |
| 条件分支根据上一步输出正确跳过 | 条件为 false 时 step 标记为 `skipped` |
| 模板渲染正确解析 `{{variable}}` | 模板中包含的变量被正确替换 |
| Session 持久化可跨进程恢复 | 重启后 `team.status` 仍可查到历史 session |
| 所有 logger 关键节点有日志输出 | 验证 `logger.*` 调用次数 |
| DAG 并行执行正确 | 2+ 并行步骤同时运行，执行时间 ≈ max(各步骤时间) |
| 人工审批可暂停/恢复 | `team.approve` 后工作流继续 |
| 全部 209+ 现存测试通过 | `npx vitest run` 绿色 |
| TypeScript 编译 0 错误 | `npx tsc --noEmit` |
