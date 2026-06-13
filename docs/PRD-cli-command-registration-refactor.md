# PRD: CLI Command Registration 重构

## Problem Statement

agentX CLI 在启动时因 Commander.js 重复命令注册而崩溃。当多个子命令注册器各自独立创建同名的命令组或子命令时，Commander.js 会抛出 `cannot add command 'X' as already have command 'X'` 错误，导致 CLI 完全无法使用。

用户在使用 `agentx` 命令时会遇到启动失败，无法执行任何子命令（如 `agentx search`、`agentx remote list`、`agentx batch delete` 等）。

## Solution

重构 CLI 命令注册逻辑，遵循 Commander.js 的单一职责原则：每个命令组/子命令只应由一个注册器创建，并通过依赖注入的方式传递给需要添加子命令的注册器。

具体方案：
1. 在 `cli.ts` 入口文件中一次性创建所有命令组（`remote`、`mcp`、`batch`）
2. 将这些预创建的命令组对象传递给对应的子命令注册器
3. 子命令注册器不再自行创建命令组，只负责注册自己的子命令

## User Stories

1. 作为开发者，我想要在运行 `agentx` 时 CLI 能正常启动，以便执行任何子命令
2. 作为开发者，我想要 `agentx remote list` 能正常列出已配置的远程仓库，以便管理同步目标
3. 作为开发者，我想要 `agentx remote add` 能正常添加远程仓库，以便扩展同步能力
4. 作为开发者，我想要 `agentx remote remove` 能正常移除远程仓库，以便清理无用配置
5. 作为开发者，我想要 `agentx mcp send` 能正常发送 MCP 请求，以便与 MCP 服务交互
6. 作为开发者，我想要 `agentx mcp inspect` 能正常检查 MCP 服务状态，以便诊断连接问题
7. 作为开发者，我想要 `agentx batch delete` 能正常批量删除资源，以便高效清理
8. 作为开发者，我想要 `agentx batch tag` 能正常批量添加/移除标签，以便组织资源
9. 作为开发者，我想要 `agentx delete` 能正常删除单个资源，以便精细管理
10. 作为开发者，我想要 `agentx search` 能正常搜索资源，以便快速查找
11. 作为开发者，我想要 `agentx list` 能正常列出资源，以便浏览资源库
12. 作为开发者，我想要 `agentx info` 能正常显示资源详情，以便了解资源信息
13. 作为开发者，我想要 `agentx get` 能正常获取资源内容，以便查看完整定义
14. 作为开发者，我想要 `agentx export` 能正常导出资源，以便备份和迁移
15. 作为开发者，我想要 `agentx import` 能正常导入资源，以便恢复和共享
16. 作为开发者，我想要 `agentx create` 能正常创建资源，以便扩展资源库
17. 作为开发者，我想要 `agentx clone` 能正常克隆资源，以便快速复制和定制
18. 作为开发者，我想要 `agentx validate` 能正常验证资源，以便确保质量
19. 作为开发者，我想要 `agentx template` 能正常使用模板，以便加速创建
20. 作为开发者，我想要 `agentx doctor` 能正常运行诊断，以便排查问题
21. 作为开发者，我想要 `agentx graph` 能正常显示依赖图，以便理解资源关系
22. 作为开发者，我想要 `agentx proxy` 能正常管理代理，以便配置远程访问
23. 作为开发者，我想要 `agentx init` 能正常初始化项目，以便快速开始
24. 作为开发者，我想要 `agentx audit` 能正常查看审计日志，以便追踪变更
25. 作为开发者，我想要 `agentx backup` 能正常备份资源，以便防止数据丢失
26. 作为开发者，我想要 `agentx restore` 能正常恢复资源，以便从备份还原
27. 作为开发者，我想要 `agentx web` 能正常启动 Web 仪表板，以便可视化浏览
28. 作为开发者，我想要 `agentx pull` 能正常拉取远程资源，以便同步更新
29. 作为开发者，我想要 `agentx push` 能正常推送本地资源，以便共享和备份

## Implementation Decisions

### 1. 命令组创建权集中化

所有命令组（`remote`、`mcp`、`batch`）必须在 `cli.ts` 中一次性创建，子命令注册器只接收已创建的命令组对象并注册子命令。

### 2. 注册器接口统一

所有需要接收命令组的注册器函数，统一使用 `Command` 类型参数（来自 `commander`），不再自行创建命令组。

### 3. 已修复的冲突

- `remote` 命令组：`registerRemoteList`、`registerRemoteAdd`、`registerRemoteRemove` 不再各自创建 `program.command('remote')`，而是接收预创建的 `remote` 命令组
- `mcp` 命令组：`registerMcpSend`、`registerMcpInspect` 不再各自创建 `program.command('mcp')`，而是接收预创建的 `mcp` 命令组

### 4. 待修复的冲突

- `batch` 命令组：`registerBatchCommand` 在内部通过 `program.addCommand(deleteCmd)` 创建了 `delete` 子命令，这与 `registerDeleteCommand` 在顶层注册的 `delete` 命令冲突
  - 解决方案：将 `batch` 命令组的 `delete` 子命令改为通过预创建的 `batch` 命令组注册，或调整命令层级结构

### 5. 注册器函数签名变更

所有受影响的注册器函数签名从：
```typescript
export function registerRemoteList(program: Command): void
```
变更为：
```typescript
export function registerRemoteList(remote: Command): void
```

参数名从 `program` 改为更具语义化的名称（如 `remote`、`mcp`、`batch`），以反映其实际用途。

## Testing Decisions

### 测试目标

验证 CLI 启动成功，且所有子命令都能正确注册和调用。

### 测试方法

1. **启动测试**：运行 `agentx --help` 验证 CLI 能正常启动并显示帮助信息
2. **子命令测试**：逐一运行各子命令（如 `agentx search "test"`、`agentx remote list`）验证无重复命令错误
3. **集成测试**：运行现有的自动化测试套件，确保重构未破坏现有功能

### 测试标准

- CLI 启动无错误
- 所有子命令都能被正确识别和调用
- 命令层级结构符合预期（如 `agentx remote list`、`agentx batch delete`）

## Out of Scope

- 不改变现有命令的 CLI 参数、选项或行为
- 不添加新命令或新功能
- 不修改 Commander.js 版本或依赖
- 不涉及 MCP 工具层的变更

## Further Notes

- 本次重构仅解决命令注册的架构问题，不涉及业务逻辑变更
- 建议在修复 `batch` 命令组冲突后，全面审查所有命令注册器，确保没有其他类似的重复注册问题
- 后续可考虑将命令组创建模式抽象为工厂函数，进一步减少样板代码
