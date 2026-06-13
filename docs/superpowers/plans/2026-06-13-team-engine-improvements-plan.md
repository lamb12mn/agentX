# Team Engine 改进 — 实施计划

**来源:** specs/2026-06-13-team-engine-improvements-design.md
**日期:** 2026-06-13

## 阶段 A - 核心功能补完（~350 LOC）
1. 新建 `src/ai/provider.ts` — AiProvider 接口
2. 新建 `src/orchestrator/template.ts` — 模板渲染工具
3. 修改 `src/types.ts` — 更新类型
4. 修改 `src/orchestrator/team-engine.ts` — AI 委托 + 条件 + 模板 + 变量
5. 更新测试 `tests/orchestrator/team-engine.test.ts`

## 阶段 C - 生产就绪（~300 LOC）
6. 新建 `src/store/executions.ts` — session DB 操作
7. 修改 `src/store/db.ts` — 迁移
8. 修改 `src/orchestrator/team-engine.ts` — 持久化 + 日志 + webhook
9. 修改 `src/tools/teams.ts` — +history/logs 工具
10. 修改 `src/cli/commands/team.ts` — +history/logs 命令
11. 新建 `tests/store/executions.test.ts`

## 阶段 B - 全功能工作流（~250 LOC）
12. 修改 `src/orchestrator/team-engine.ts` — DAG + 并行 + 路由 + 审批
13. 修改 `src/tools/teams.ts` — +approve/reject/pending 工具
14. 修改 `src/cli/commands/team.ts` — +approve/reject/pending 命令

## 并行策略
- **Workstream A（核心逻辑）:** 步骤 1-5（独占 team-engine.ts 执行逻辑）
- **Workstream C（基础设施）:** 步骤 6-7-11（独立新文件，与 A 无冲突）
- **串行依赖:** 步骤 8-10 需在 A 完成后的 team-engine.ts 上追加

## 验证
- `npx tsc --noEmit` 零错误
- `npx vitest run` 全绿
