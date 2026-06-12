# 依赖清理报告 (depcheck 模拟)

生成时间: 2026-05-09T17:05:05.111Z

## 可能未使用的依赖
以下依赖在 `src/` 源码中未检测到引用（启发式扫描）：
- @inquirer/prompts
- @modelcontextprotocol/sdk
- archiver
- better-sqlite3
- chalk
- cli-table3
- js-yaml
- lru-cache
- uuid
- zod
- @types/better-sqlite3
- @types/js-yaml
- @types/node
- @types/uuid
- @typescript-eslint/eslint-plugin
- @typescript-eslint/parser
- eslint
- tsx
- typescript
- vitest

## 建议操作
- 运行 `npx depcheck` 获得精确分析
- 对于上述列表，逐个验证后使用 `npm uninstall <pkg>` 移除

## 保留的依赖（已检测到引用）
commander ...
