# Issues: CLI Command Registration 重构

## Issue 1: 修复 remote 命令组重复注册

### What to build

在 `cli.ts` 中创建 `remote` 命令组，修改 `registerRemoteList`、`registerRemoteAdd`、`registerRemoteRemove` 接收预创建的命令组对象，不再各自创建 `program.command('remote')`。

### Acceptance criteria

- [ ] `cli.ts` 中创建 `const remote = program.command('remote')`
- [ ] `registerRemoteList`、`registerRemoteAdd`、`registerRemoteRemove` 函数签名改为接收 `Command` 参数
- [ ] 三个注册器内部使用传入的命令组注册子命令
- [ ] CLI 启动无重复命令错误

### Blocked by

None - can start immediately

---

## Issue 2: 修复 mcp 命令组重复注册

### What to build

在 `cli.ts` 中创建 `mcp` 命令组，修改 `registerMcpSend`、`registerMcpInspect` 接收预创建的命令组对象，不再各自创建 `program.command('mcp')`。

### Acceptance criteria

- [ ] `cli.ts` 中创建 `const mcp = program.command('mcp')`
- [ ] `registerMcpSend`、`registerMcpInspect` 函数签名改为接收 `Command` 参数
- [ ] 两个注册器内部使用传入的命令组注册子命令
- [ ] CLI 启动无重复命令错误

### Blocked by

None - can start immediately

---

## Issue 3: 解决 batch/delete 命令冲突

### What to build

分析 `batch.ts` 和 `delete.ts` 的冲突根源，决定命令层级结构（`batch delete` vs 顶层 `delete`），实施修复。

### Acceptance criteria

- [ ] 明确 `batch delete` 和顶层 `delete` 的职责边界
- [ ] 消除重复命令注册冲突
- [ ] CLI 启动无重复命令错误

### Blocked by

None - can start immediately

---

## Issue 4: CLI 启动冒烟测试

### What to build

运行 `agentx --help` 验证启动，验证所有子命令可被正确识别和调用，验证命令层级结构。

### Acceptance criteria

- [ ] `agentx --help` 正常显示帮助信息
- [ ] 所有子命令都能被正确识别
- [ ] 命令层级结构符合预期（如 `agentx remote list`、`agentx batch delete`）

### Blocked by

- Issue 1: 修复 remote 命令组重复注册
- Issue 2: 修复 mcp 命令组重复注册
- Issue 3: 解决 batch/delete 命令冲突

---

## Issue 5: 全子命令回归验证

### What to build

逐一调用主要子命令验证功能正常，运行现有测试套件确保重构未破坏现有行为。

### Acceptance criteria

- [ ] 主要子命令（search、list、info、get、remote list、batch delete 等）可正常执行
- [ ] 现有测试套件通过
- [ ] 无回归问题

### Blocked by

- Issue 4: CLI 启动冒烟测试
