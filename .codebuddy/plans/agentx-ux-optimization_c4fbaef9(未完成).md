---
name: agentx-ux-optimization
overview: 优化AgentX的交互体验，包括MCP工具交互增强、CLI功能扩展、工作流模板系统和操作反馈机制
design:
  architecture:
    framework: react
    component: shadcn
  styleKeywords:
    - Modern Terminal UI
    - Progressive Disclosure
    - Color-coded Feedback
    - Interactive Prompts
  fontSystem:
    fontFamily: Consolas, Monaco, monospace
    heading:
      size: bold
      weight: 700
    subheading:
      size: normal
      weight: 600
    body:
      size: normal
      weight: 400
  colorSystem:
    primary:
      - "#00BFFF"
      - "#00FFFF"
    background:
      - "#000000"
      - "#0D1117"
    text:
      - "#FFFFFF"
      - "#C0C0C0"
    functional:
      - "#00FF00"
      - "#FF0000"
      - "#FFFF00"
todos:
  - id: phase1-mcp-interaction
    content: 增强MCP工具交互体验：添加交互式输入提示和智能错误处理
    status: pending
  - id: phase2-cli-create
    content: 实现CLI create命令：支持交互式和命令行参数创建资产
    status: pending
    dependencies:
      - phase1-mcp-interaction
  - id: phase2-multi-format
    content: 添加多格式输出支持：JSON/YAML/简洁模式
    status: pending
    dependencies:
      - phase1-mcp-interaction
  - id: phase3-template-system
    content: 建立模板系统：预设skill/rule/agent模板库和模板命令
    status: pending
    dependencies:
      - phase2-cli-create
  - id: phase3-validator
    content: 创建验证命令：检查资产完整性、依赖关系、配置正确性
    status: pending
    dependencies:
      - phase2-cli-create
  - id: phase4-batch-operations
    content: 实现批量操作：批量删除、批量导出、批量标签管理
    status: pending
    dependencies:
      - phase2-multi-format
  - id: phase4-progress-feedback
    content: 增强进度反馈：操作进度条、结果摘要、交互式确认
    status: pending
    dependencies:
      - phase3-validator
---

## 用户需求概述

作为高级MCP工具开发工程师，优化AgentX项目的交互体验，增强用户体验。

## 核心优化方向

1. **MCP工具交互增强**：富交互提示、智能错误处理、操作确认
2. **CLI功能扩展**：create命令、多格式输出、批量操作、交互模式
3. **工作流与模板系统**：智能体创建工作流向导、预设模板库、配置验证
4. **反馈与引导系统**：进度显示、结果摘要、交互式帮助

## 关键约束

- 保持项目轻量级（核心依赖仅7个）
- 向后兼容，不破坏现有API
- 测试覆盖率保持100%
- 遵循现有代码模式和架构

## 技术栈（基于现有项目）

- **运行时**: Node.js ≥18 + TypeScript 6.0.3
- **MCP SDK**: @modelcontextprotocol/sdk ^1.29.0
- **数据库**: better-sqlite3 ^12.9.0
- **CLI框架**: commander ^14.0.3
- **验证**: zod ^4.3.6
- **终端UI**: 
- 已有: chalk (颜色), cli-table3 (表格)
- 新增: inquirer (交互式输入，已在package.json中)
- **文件处理**: js-yaml ^4.1.1, uuid ^14.0.0

## 架构设计原则

1. **单一职责**: 每个模块只负责一个优化维度
2. **依赖倒置**: 高层模块依赖抽象接口
3. **开闭原则**: 通过配置扩展功能，不修改核心逻辑
4. **最小惊讶**: 保持与现有CLI命令风格一致

## 实施策略

采用**渐进式增强**策略：

- Phase 1: 增强MCP工具交互（基础体验）
- Phase 2: 扩展CLI功能（create命令、多格式输出）
- Phase 3: 模板与工作流系统（高级功能）
- Phase 4: 反馈与引导系统（ polish）

## 性能考虑

- 交互提示使用同步API（inquirer），避免异步复杂度
- 模板渲染使用缓存（内存LRU缓存常用模板）
- 批量操作使用事务（数据库事务保证一致性）
- 输出格式转换使用流式处理（避免大文件内存占用）

## 向后兼容性

- 现有33个MCP工具API保持不变
- 现有7个CLI命令参数保持不变
- 新增命令和选项不影响现有脚本
- 错误码和输出格式兼容（新增格式可选）

## 设计风格：现代终端UI

虽然AgentX是终端应用，但我们将采用**现代终端UI设计原则**：

### 视觉层次

- **主标题**: 粗体+高亮色（cyan）
- **分区标题**: 下划线+加粗
- **交互提示**: 黄色高亮+图标
- **成功反馈**: 绿色+✓图标
- **错误警告**: 红色+✗图标
- **信息提示**: 蓝色+ℹ️图标

### 交互设计

- **渐进式披露**: 先显示核心信息，需要时展开详情
- **操作确认**: 危险操作前二次确认（delete、update）
- **实时反馈**: 每个操作都有明确的结果摘要
- **错误恢复**: 错误信息包含可执行的解决建议

### 输出格式

1. **表格模式**（默认）：人类可读，适合终端查看
2. **JSON模式**：机器可读，适合脚本处理
3. **YAML模式**：适合配置文件编辑
4. **简洁模式**：仅关键信息（用于脚本）

### 色彩系统

```javascript
colors: {
  primary: '#00BFFF',    // 主色调（bright cyan）
  success: '#00FF00',    // 成功（green）
  warning: '#FFFF00',    // 警告（yellow）
  error: '#FF0000',      // 错误（red）
  info: '#00FFFF',       // 信息（cyan）
  muted: '#808080',      // 次要信息（gray）
  highlight: '#FFD700'   // 高亮（gold）
}
```

### 字体系统（终端）

- **标题**: 粗体 + 下划线
- **命令**: 反白显示（inverse）
- **路径**: 斜体
- **代码**: 等宽字体 + 背景色

## 扩展技能使用

### 1. [skill:frontend-dev] - 前端开发技能

**用途**: 构建CLI交互界面和输出格式化
**使用场景**:

- 实现交互式命令（inquirer集成）
- 设计终端UI组件（进度条、选择器）
- 多格式输出引擎（JSON/YAML/Table）

### 2. [skill:code-simplifier] - 代码简化专家

**用途**: 保持代码简洁性和可维护性
**使用场景**:

- 重构现有工具注册模式
- 简化CLI命令参数解析
- 优化错误处理逻辑

### 3. [skill:design-taste-frontend] - UI/UX设计专家

**用途**: 终端用户体验设计
**使用场景**:

- 设计交互流程和信息架构
- 优化输出格式和视觉层次
- 制定一致性规范

### 4. [subagent:code-explorer] - 代码探索代理

**用途**: 深入分析现有代码结构
**使用场景**:

- 定位CLI命令注册点
- 理解MCP工具调用链
- 识别需要修改的关键文件