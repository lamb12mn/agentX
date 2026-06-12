[Reading 87 lines from start (total: 87 lines, 0 remaining)]

[Reading 72 lines from start (total: 72 lines, 0 remaining)]

# AgentX 优化计划 (基于 goal-driven + using-superpowers)

生成时间: 2026-05-09T16:42:25.098Z

## 指导原则
- **goal-driven**: 以最终目标为导向，将大任务拆解为可验证的小步骤，每完成一步都检查是否向目标靠近。
- **using-superpowers**: 充分利用已有技能、工具和自动化能力，避免重复工作，保持高效。

## 最终目标
使 AgentX 成为一个**生产就绪、可测试、文档完善、易于扩展**的 MCP 服务器。

## 里程碑与任务拆解

### 里程碑 1: 代码质量与类型安全 (P0)
- [ ] 1.1 启用 TypeScript strict 模式  
  - 修改 `tsconfig.json`，设置 `"strict": true`  
  - 修复所有编译错误（预估 10–20 处）  
  - 验证: `npm run build` 无错误
- [ ] 1.2 统一代码风格  
  - 配置 ESLint + Prettier（已有 .eslintrc.json）  
  - 添加 `lint` 和 `format` 脚本  
  - 验证: `npm run lint` 零警告
- [ ] 1.3 添加 Git hooks  
  - 使用 husky + lint-staged  
  - 提交前自动 lint 和格式化  
  - 验证: 提交时自动执行

### 里程碑 2: 测试体系 (P0)
- [ ] 2.1 创建测试目录结构  
  - 新建 `tests/unit`, `tests/integration`  
  - 配置 vitest（已有 vitest.config.ts）  
- [ ] 2.2 编写第一个单元测试  
  - 针对一个纯函数（如 utils/validation）  
  - 验证: `npm test` 通过
- [ ] 2.3 为核心 MCP 消息处理编写集成测试  
  - 模拟 MCP 客户端，发送请求  
  - 验证响应结构与错误处理  
- [ ] 2.4 设置 CI 测试流水线  
  - GitHub Actions: 在 push/PR 时运行 test & lint

### 里程碑 3: 文档完善 (P1)
- [ ] 3.1 更新 README.md  
  - 快速开始、配置说明、示例  
- [ ] 3.2 编写测试指南 (`docs/testing.md`)  
  - 如何运行测试、编写新测试、调试  
- [ ] 3.3 补充架构文档  
  - 更新 `docs/ARCHITECTURE.md` 反映当前 src 结构  
- [ ] 3.4 添加开发者贡献指南  
  - 基于 CONTRIBUTING.md 模板

### 里程碑 4: 模块清理与优化 (P2)
- [ ] 4.1 处理 `.autoresearch` 目录  
  - 添加 README 说明 score.js 用途  
  - 或移至 `tools/` 目录  
- [ ] 4.2 决定 `complex-skill-example` 去留  
  - 若保留，移入 `examples/` 并补充文档  
  - 否则删除或独立仓库
- [ ] 4.3 性能基准测试  
  - 在集成测试稳定后进行  
  - 使用 `autocannon` 或同类工具

## 验收标准
- 所有 P0 任务完成 → 项目可安全发布
- 测试覆盖率 ≥ 70% (关键模块 ≥ 80%)
- 新开发者能在 30 分钟内运行并理解项目

## 进度跟踪
使用 `docs/progress.md` 记录每日进展，每周回顾目标符合度。

---

*本计划遵循 goal-driven 的分解原则，并利用 using-superpowers 中提到的技能复用思想。*

---

## 📌 基于最终综合审查的调整 (2026-05-09)

参考 [final_comprehensive_review.md](./final_comprehensive_review.md)，我们决定：

1. **合并计划文件**：将现有的 `task_plan.md`, `progress.md`, `findings.md` 与本计划整合为 `master_plan.md`，作为唯一权威计划。
2. **新增 P1 任务**: 编写 `docs/Onboarding.md`，指导新开发者配置环境、运行项目、调试。
3. **调整优先级**：将"统一计划"提升至 P0，确保目标一致。
4. **明确负责人**：AI 助手负责执行所有开发任务，用户负责审查和决策（如 complex-skill-example 去留）。

具体任务拆解见 final_comprehensive_review.md 的表格。

---

## 🔍 基于 src 和文档审查的进一步调整 (2026-05-09)

根据 [src_and_docs_review.md](./src_and_docs_review.md) 的分析：

- 将单元测试任务拆分为具体文件级别：`index.ts`, `server.ts`, `mcp-handler.ts`（如果存在）。
- 新增 P3 任务：整理根目录文档，移动 FINAL_REPORT.md 到 `docs/archive/`。
- 确认 CONTRIBUTING.md 已存在，无需重复编写贡献指南，但需要确保其内容与当前流程同步。

所有 P0 任务不变。
