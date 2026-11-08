# 提示词优化统一 MCP 流程规范

本规范定义「优化提示词（含能力扩展、评测打分）」的标准操作流程。目标是**一致性**（所有写操作集中、可审计、可回滚）与**灵活性**（智能体可按场景替换模板/变量/探针，无需改代码）。

## 1. 总则（硬性约束）

1. **所有操作统一通过 agentx MCP 工具执行**，禁止以硬编码脚本（`node` / `tsx` 直接 `import` `dist` 内部模块并调用 `.handler`）绕过 MCP 接口。
2. **未配置自定义模型（`AGENTX_AI_API_KEY` 缺失）时**，一切「智能决策」环节由**对话中的智能体（当前会话的 AI 助手）**承担，再把决策结果通过 MCP 调用落盘。
3. 执行引擎 = agentx MCP（资产 / 版本 / 评测的机械操作）；智能体 = 对话中的 AI 助手（理解需求、生成内容、判断评分）。二者职责不交叉。

## 2. 角色与边界

| 角色 | 职责 | 典型动作 |
|---|---|---|
| agentx MCP（执行层） | 读 / 写 / 版本 / 留存 | `create_prompt` `update_prompt`、`create_version_snapshot` `list_versions` `rollback_to_version`、`create_evaluation_set` `add_evaluation_samples` `rate_evaluation_sample` `apply_evaluation_dsl` `evaluation_summary` `compare_evaluation_sets`、`match_builtin_prompts` |
| 对话智能体（决策层） | 理解 / 生成 / 判断 | 澄清需求、撰写能力清单与优化内容、判断样本评分、把决策转成 MCP 参数 |

**边界**：凡涉及「读/写/版本/留存」一律走 MCP；凡涉及「理解/生成/判断」一律由智能体完成。

## 3. 操作环节 → MCP 工具映射

| 环节 | 主 MCP 工具 | 对话智能体兜底 | 备注 |
|---|---|---|---|
| 创建提示词 | `create_prompt`（`content` / `templateId` / `intent`） | 智能体生成 `content` 或选择 `templateId`+`templateVars` | `intent` 走内置库自动匹配 |
| 优化前留痕 | `create_version_snapshot` | — | 每次优化前必做，作为基线 |
| 优化改写 | `update_prompt`（`templateId`+`templateVars` 或 `content`） | 智能体生成新 `content` / `templateVars` 后调用 | 33/79 已默认暴露，纯 MCP 可用 |
| 版本查看 / 回滚 | `list_versions` / `rollback_to_version` | — | 出问题一键回退 |
| 建评测集 | `create_evaluation_set`（绑定 `version`） | — | 基线集与候选集各一个 |
| 加样本 | `add_evaluation_samples`（`question`+`samples`） | 智能体设计能力探针与变量 | 同一批探针用于两集 |
| 打分 | `rate_evaluation_sample`（人工/智能体评分）或 `apply_evaluation_dsl`（规则，无需模型） | 未配模型时智能体读版本内容逐样本判断，再用 `rate_evaluation_sample` 落分 | 禁用 `ai_*` 自动路径 |
| 汇总 | `evaluation_summary` | — | 输出平均分 / GSB 分布 |
| 比较 | `compare_evaluation_sets` | — | baseline vs candidate，给提升证据 |

## 4. 端到端序列（示例：扩展「全能UI设计师」能力）

1. 智能体澄清需求（要新增哪些能力域：前后端 / 走查 / 架构 / 代码检查 / 性能等）。
2. 智能体 `get_prompt` / `list_versions` 理解现状。
3. **MCP** `create_version_snapshot`（基线，如 v2）。
4. 智能体撰写新能力清单（选择内置模板 `func-role-capability-expander` 的 `templateVars`，或手写 `content`）。
5. **MCP** `update_prompt`（落盘为 v3）。
6. **MCP** `create_evaluation_set` ×2（绑定 v2 基线、v3 候选）。
7. **MCP** `add_evaluation_samples`（同一批能力探针）。
8. 智能体读 v2/v3 内容，逐样本评分判断（覆盖度 / 关键词 / 质量）。
9. **MCP** `rate_evaluation_sample`（落智能体给出的分）或 `apply_evaluation_dsl`（规则打分）。
10. **MCP** `evaluation_summary` → `compare_evaluation_sets`（输出提升证据，决定是否保留）。

## 5. 异常处理与降级

- **工具未暴露/未注册（如未重启的旧进程）**：先确认 `AGENTX_TOOLS` 与 server 是否已重启加载最新 `dist`；隐藏工具仍可「按名调用」（`AGENTX_TOOLS=full` 重启后可见）。若仍不可达，由对话智能体直接产出结果，并以**可达的** MCP 工具（如 `create_version_snapshot` 留痕）留存，绝不回退到脚本。
- **未配置模型**：禁用 `ai_rewrite_prompt` / `ai_rate_evaluation_samples` 等自动路径，改由对话智能体兜底（§3 打分列）。
- **严禁**：`node` / `tsx` 脚本直接 `import` `dist` 内部模块调用 `.handler` 绕过 MCP。

## 6. 一致性与灵活性

- **一致性**：所有写操作走 MCP，资产与版本集中于 agentx 库，可审计、可回滚；流程不依赖任何外部脚本，环境可复现。
- **灵活性**：智能体可按场景自由替换模板、变量与探针，无需改动 agentx 源码；模型就绪后可平滑切换到 `ai_*` 自动路径，流程形态不变。

## 7. Workflow 资产（一键调度）

流程同时封装为 agentx **workflow 资产**（`workflows/prompt-optimization.yaml`），可被 `team.run` 与 REST `/api/workflows/execute` 直接调度。

- **拓扑**：三个角色接力——`analyst` → `prompt_engineer` → `evaluator` → `analyst`。
  - `analyst`：澄清需求、`get_prompt`/`list_versions` 读现状、`create_version_snapshot` 留基线。
  - `prompt_engineer`：生成能力清单、`update_prompt(templateId+templateVars)` 落盘。
  - `evaluator`：建评测集与样本、读版本判断评分、`rate_evaluation_sample`/`apply_evaluation_dsl` 落分、`evaluation_summary`/`compare_evaluation_sets` 出证据。
- **注册**（纯 MCP，需 `create_workflow` 已默认暴露于 33/79）：
  ```text
  mcp: create_workflow(
    name = "prompt-optimization",
    content = <workflows/prompt-optimization.yaml 全文>,
    description = "提示词优化与评测打分标准编排",
    tags = ["prompt", "optimization", "workflow"]
  )
  ```
- **调度**（执行入口为 REST，MCP 侧提供 CRUD）：
  ```text
  POST /api/workflows/execute
       body: { id: "<create_workflow 返回的 workflow 资产 ID>", input: { assetId, capabilitySpec } }
  # MCP 侧：create_workflow 注册、list_workflows / get_workflow 查看；
  # team.run 用于 team 资产编排，workflow 资产走上面的 REST 执行入口。
  ```
- **执行模型（无模型兜底）**：未配置 `AGENTX_AI_API_KEY` 时，TeamEngine 以 `simulated: true` 跑出流程骨架；**对话智能体按本拓扑逐角色调用上述 MCP 工具完成实际工作**，把智能决策（能力清单、评分）以 MCP 参数形式落盘。workflow 在此既是一份可审计的流程契约，也是对话智能体执行的蓝图。

## 8. 执行记录（纯 MCP 范例）

记录一次完整、零脚本的端到端执行：修复 agentx 一致性缺陷 → 注册 workflow 资产 → 按拓扑迭代打分「全能UI设计师」。所有写操作经 MCP，智能决策由对话智能体承担。

### 8.1 前置修复：workflow 工具纳入默认暴露
- 现象：经 IDE 的 agentx MCP 通道调用 `create_workflow` 报 `Tool not found`；`discover_tools` 显示 `workflows` 组只 `exposed: 1`（仅 `list_workflows`），其余 4 个写入工具未进入 `CORE_TOOLS`，与其他资产类型（prompt/skill 的 CRUD 默认暴露）不一致。
- 修复：`src/tools/catalog.ts` 把 `create_workflow` / `get_workflow` / `update_workflow` / `delete_workflow` 纳入 `CORE_TOOLS`；同步文档数字（核心 27 → 31，默认暴露 29 → 33，README + API_REFERENCE 共 7 处）。
- 验证：`build` + `verify-docs`(16/16) + `typecheck` + `lint` + 全量测试（29 文件 / 366 用例）全绿；启动诊断 `core — 33/79`。
- 注意：IDE 的 agentx MCP 进程不会热更新，需**重启**方能加载新 dist。

### 8.2 注册 workflow 资产（纯 MCP）
- `create_workflow` → 资产 ID `9b34d2b5-535d-4709-8589-5ff3e2de6b3c`，落盘 `agentXData/workflows/prompt-optimization.yaml`。
- 拓扑 `analyst → prompt_engineer → evaluator → analyst` 固化，可被 REST `/api/workflows/execute` 调度。

### 8.3 按拓扑迭代「全能UI设计师」(assetId `38ffb70d-b398-42cc-899f-e1b61936be7a`)
| 拓扑步 | 纯 MCP 动作 | 关键结果 |
|---|---|---|
| analyst | `get_prompt` / `list_versions` 读现状（v4 基线） | 识别 v4 不对称：Skills 第 8 节「交付与协作」无对应 Workflows 流程 |
| prompt_engineer | 对话智能体生成 `G. 交付与协作任务` 节 → `update_prompt(content)` 落 v5 | 补齐 Skills↔Workflows 对齐 |
| analyst | `create_version_snapshot` | version 5 固化 |
| evaluator | `create_evaluation_set`×2（v4 基线 / v5 候选）+ `add_evaluation_samples` | 每集 2 样本：① Skills 能力清单（测五大能力覆盖）② Workflows 全节（测交付协作流程） |
| evaluator | `apply_evaluation_dsl`（统一 `when` DSL） | v4 均分 3.0（Workflows 样本缺 G 节命中默认 1）；v5 均分 5.0（命中规则 2） |
| evaluator | `evaluation_summary` → `compare_evaluation_sets` | `averageScoreDelta: +2`、`improved: true` |

### 8.4 结论
- 全流程零硬编码脚本：所有写操作（注册、更新、快照、评测）经 MCP；智能决策（识别不对称、生成 G 节、设计 DSL）由对话智能体承担。
- 迭代价值可量化：v5 在「交付协作流程」维度补齐后综合评分 3.0 → 5.0（满分）。
- 评分 DSL 采用 `when` 条件（首条命中即定分）：规则 1 校验五大能力短语全命中给 5；规则 2 校验 `交付与协作任务` 流程存在给 5；其余默认 1。v4 的 Workflows 样本因无 G 节落入默认分，体现为迭代前后的可量化差异。

