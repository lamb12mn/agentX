# complex-skill-example

这是一个独立的技能示例项目，用于展示如何构建复杂的 AI 技能。

## 目录结构
```
[DIR] smart-frontend-generator
[DIR] src
```

### src/ 目录内容（如有）
```
[DIR] components
[DIR] pages
[DIR] routes
```

## 与主项目的关系
本目录与 `agentx-mcp` 主项目没有直接的构建依赖，是一个独立的示例/参考实现。

## 去留建议
根据项目维护策略，您可以选择：

1. **保留在当前仓库** – 作为示例供开发者参考，但会增加仓库体积。  
   建议：将其移至 `docs/examples/` 或添加符号链接。

2. **移出到独立仓库** – 保持主仓库简洁，通过文档引用外部链接。  
   操作：`git mv complex-skill-example ../agentx-examples` 或直接删除。

3. **完全删除** – 如果不再需要。  
   操作：`git rm -rf complex-skill-example`

## 当前状态
本 README 仅作为记录，具体决策请由项目负责人根据实际需求执行。

> 生成时间: 2026-05-09T17:08:47.170Z
