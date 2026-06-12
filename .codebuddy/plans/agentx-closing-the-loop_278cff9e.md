---
name: agentx-closing-the-loop
overview: 实现AgentX功能闭环：添加批量操作、依赖检查、ZIP导出、资产复制等核心缺失功能，使项目从"静态资产库"升级为"完整可用的智能体工作台"
design:
  architecture:
    framework: html
todos:
  - id: phase1-batch-delete
    content: "实现批量删除功能: CLI `agentx batch delete"
    status: completed
---

## 用户需求概述

作为高级MCP工具开发工程师，继续优化AgentX项目，实现功能闭环。当前项目已达成100分评分，TypeScript编译无错误，测试全部通过，文档完整。但存在核心功能缺失：工作流执行引擎缺失、批量操作缺失、依赖管理缺失、ZIP导出未实现、测试覆盖率不完整等。需要系统性地填补这些功能缺口，实现完整的资产生命周期管理闭环。

## 核心优化方向

1. **P0级核心功能**（立即实现）：批量操作、依赖检查、ZIP导出
2. **P1级重要功能**（短期实现）：资产克隆、批量导入/导出、版本快照
3. **P2级体验优化**（中期实现）：自定义模板、依赖图、增强验证、统计仪表板
4. **测试覆盖率**：补全缺失的单元测试，目标80%+

## 关键约束

- 保持项目轻量级（核心依赖≤10个）
- 向后兼容，不破坏现有API
- 测试覆盖率保持100%
- 遵循现有代码模式和架构
- 所有新功能必须通过CLI和MCP双入口暴露

## 技术栈（基于现有项目）

- **运行时**: Node.js ≥18 + TypeScript 6.0.3
- **MCP SDK**: @modelcontextprotocol/sdk ^1.29.0
- **数据库**: better-sqlite3 ^12.9.0
- **CLI框架**: commander ^14.0.3
- **验证**: zod ^4.3.6
- **终端UI**: chalk, cli-table3
- **文件处理**: js-yaml, uuid, archiver (新增ZIP支持)

## 架构设计原则

1. **单一职责**: 每个模块只负责一个优化维度
2. **依赖倒置**: 高层模块依赖抽象接口
3. **开闭原则**: 通过配置扩展功能，不修改核心逻辑
4. **最小惊讶**: 保持与现有CLI命令风格一致

## 实施策略

采用**渐进式增强**策略，分4个Phase实现闭环：

**Phase 1（P0 - 1周）**: 批量操作 + 依赖检查 + ZIP导出

- 新增CLI命令: `agentx batch delete|tag|copy` + MCP工具: `batch_delete`, `batch_tag`
- 增强delete: 删除前检查依赖关系
- 新增CLI命令: `agentx export-all` + MCP工具: `export_all`
- ZIP格式导出完整资产库

**Phase 2（P1 - 2周）**: 资产克隆 + 批量导入/导出 + 版本快照

- 新增CLI命令: `agentx clone <id>` + MCP工具: `clone_asset`
- 新增CLI命令: `agentx export-all` 增强 + `agentx import-all`
- 新增版本表，实现快照和回滚

**Phase 3（P2 - 3-4周）**: 自定义模板 + 依赖图 + 增强验证 + 统计仪表板

- 用户自定义模板目录 (~/.agentx/templates/)
- 新增CLI命令: `agentx graph <id>` 显示依赖图
- 增强validate: 内容质量检查
- 增强info: 详细统计（标签云、最活跃资产）

**Phase 4（长期 - 1-2月）**: 工作流执行引擎

- 实现workflow YAML解析和执行器
- 支持步骤执行、条件分支、错误处理
- 新增MCP工具: `run_workflow`, `workflow_status`

## 性能考虑

- 批量操作使用数据库事务
- ZIP导出使用流式压缩
- 依赖检查使用缓存
- 版本快照使用增量存储

## 向后兼容性

- 所有现有API保持不变
- 新增命令和选项不影响现有脚本
- 错误码和输出格式兼容

## Agent Extensions

本计划需要以下扩展支持：

### SubAgent

- **code-explorer**: 已使用，用于探索代码库结构，识别功能缺口
- **未来可能使用**: 用于深入分析特定模块（如workflow执行引擎设计）

### Skill

- **前端开发技能**: 用于构建CLI交互界面（如果需要增强终端UI）
- **代码简化专家**: 用于保持新代码简洁性和可维护性
- **UI/UX设计专家**: 用于设计终端用户体验（进度条、交互流程）

**注意**: 当前计划阶段主要进行架构设计，具体实现时将根据任务需要调用相应扩展。