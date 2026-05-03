# Findings & Decisions

## Requirements
<!-- 从用户需求和项目现状中提取的具体要求 -->
- 完成 Phase 9-10 文档阶段，填补项目文档空白
- 创建完整的用户文档体系，支持新用户 5 分钟快速上手
- 编写 API 参考文档，覆盖全部 19 个 MCP 工具
- 提供配置说明和故障排除指南
- 编写开发者文档（贡献指南、架构说明）
- 基于 git 提交历史生成 CHANGELOG
- 所有文档使用 Markdown 格式，GitHub 友好
- 所有命令示例必须实际验证可执行
- 支持 Windows/macOS/Linux 多平台说明

## Research Findings
<!-- 从设计文档和代码库中发现的关键信息 -->
- **项目定位**：本地优先的智能体工厂，让用户像搭乐高一样组合 Skills/MCP/提示词/规则
- **技术栈**：Node.js 18+、TypeScript、MCP SDK、SQLite、Commander CLI
- **已完成功能**（Phase 1-8）：
  - 数据库层（SQLite 索引 + 资产表）
  - 资产 CRUD（Skill/Prompt/Rule/MCP/Agent/Workflow）
  - 33 个 MCP 工具（list/get/create/update/delete/export/search，6 类资产 × 5-6 个/类）
  - CLI 工具（7 个命令：list、search、info、get、delete、export、import）
  - ZIP 导出格式
  - TypeScript 编译无错误
- **存储结构**：`~/.agentx/` 目录（可自定义 AGENTX_DIR）
  - skills/、prompts/、rules/、mcps/、workflows/、agents/ 子目录
  - db.sqlite 索引数据库
- **导出格式**：CLAUDE.md + settings.json（Claude Code 兼容）
- **现有文档**：
  - docs/2026-04-27-agentx-design.md（需求设计）
  - docs/superpowers/plans/（实施计划）
  - docs/superpowers/specs/（技术规格）
  - CLAUDE.md（编码准则）
- **缺失文档**：README、用户指南、API 参考、配置文档、故障排除、贡献指南、架构图、CHANGELOG

## Key Discoveries During Documentation Phase
<!-- 文档编写过程中发现的重要信息 -->
1. **CLI 命令结构**（重大纠正）：
   - 实际命令：`list [type]`（不是 `list-skills`、`list-prompts` 等独立命令）
   - 实际命令：`import <type>`（不是 `import --type <type>`）
   - 不存在 `agentx create` 命令，资产创建需通过 MCP 服务器
   - 7 个 CLI 命令：list、search、info、get、delete、export、import

2. **MCP 工具数量**：
   - 初始估计：19 个
   - 实际统计：33 个（Skills 5 + Prompts 5 + Rules 5 + MCPs 5 + Agents 6 + Workflows 5 + Search 1 + Import 1）

3. **文档结构优化**：
   - 根目录：README.md、CONTRIBUTING.md、CHANGELOG.md
   - 子目录 docs/：USER_GUIDE.md、API_REFERENCE.md、CONFIGURATION.md、TROUBLESHOOTING.md、ARCHITECTURE.md
   - 内部链接统一使用 `./` 相对路径（从 docs/ 目录内）

4. **资产导出限制**：
   - `agentx export` 仅支持 agent 类型（ZIP 格式）
   - 其他资产类型通过 `agentx get` 获取 Markdown 内容后手动复制

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 文档根目录结构：README.md + CONTRIBUTING.md + CHANGELOG.md | 符合开源项目标准，GitHub 自动识别 |
| 详细指南放入 docs/ 子目录 | 保持根目录简洁，便于分类管理 |
| 使用 Mermaid 绘制架构图 | 内嵌 Markdown、GitHub 原生支持、易于维护 |
| API 文档按工具类型分组 | 6 类资产对应 6 组工具，结构清晰 |
| 故障排除按错误码/现象分类 | 方便用户快速定位问题 |
| 贡献指南包含完整开发环境搭建 | 降低新人上手门槛 |
| CHANGELOG 基于 git log 生成 | 准确反映版本变更，避免遗漏 |
| 所有示例命令添加 Windows/macOS/Linux 说明 | 跨平台支持，避免平台差异 confusion |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 项目已完成 Phase 1-8，但文档几乎为空 | 需要系统性地补全全链路文档 |
| 部分 CLI 命令可能未实际测试 | 在编写文档过程中需要执行验证 |
| 现有设计文档较简略 | 需要从代码中反推完整功能细节 |
| CLI 命令文档与实现严重不符 | 通过源码阅读和 CLI help 输出验证，系统性纠正所有文档 |

## Documentation Corrections Made
<!-- 文档审查过程中纠正的重大错误 -->
| Error Type | Files Affected | Correction Made |
|------------|----------------|-----------------|
| 虚构的 `agentx create` 命令 | README.md、USER_GUIDE.md、TROUBLESHOOTING.md、CHANGELOG.md | 全部移除，改为通过 MCP 服务器创建资产 |
| 错误的 `list` 子命令（list-skills 等） | README.md、CHANGELOG.md | 改为统一的 `list [type]` 语法 |
| 错误的 `import` 选项语法 | USER_GUIDE.md | `import --type <type>` → `import <type>` |
| MCP 工具数量错误（19 → 33） | README.md、API_REFERENCE.md | 更新为正确的 33 个工具 |
| 工具类别数量错误 | README.md | Prompts 3→5、Rules 3→5、MCPs 4→5、Agents 4→6 |
| 内部链接格式错误 | USER_GUIDE.md、TROUBLESHOOTING.md | `docs/xxx.md` → `./xxx.md` |
| `list` 命令不存在的 `--tag` 选项 | USER_GUIDE.md | 改为使用 `search` 命令 |
| `agentx export` 适用范围错误 | USER_GUIDE.md | 明确仅支持 agent 类型 |

## Documentation Statistics
<!-- 最终文档产出统计 -->
| Metric | Count |
|--------|-------|
| 文档总字数 | ~12,500 字 |
| 代码示例数量 | 80+ 个 |
| Mermaid 图表 | 8 张 |
| 涵盖 MCP 工具 | 33/33 (100%) |
| CLI 命令文档 | 7/7 (100%) |
| 资产类型说明 | 6/6 (100%) |
| 平台支持 | Windows/macOS/Linux |
| 文档文件总数 | 9 个（根目录 3 + docs/ 6） |

## Build & Test Status
<!-- 构建和测试状态 -->
| Status | Item | Details |
|--------|------|---------|
| ✅ | TypeScript Compilation | `npx tsc --noEmit` - 0 errors |
| ✅ | All Tests | 92/92 passed (8 test files) |
| ✅ | MCP Server Load | All 33 tools registered successfully |
| ✅ | CLI Commands | 7 commands operational |

## Issues Fixed During Implementation
<!-- 实施过程中修复的问题 -->
| # | Issue | Resolution |
|---|-------|------------|
| 1 | `createDependency` not exported | Added `export { addDependency as createDependency }` in assets.ts |
| 2 | `indexAssetContent` not exported | Added `export { indexAssetContent } from './search.js'` in assets.ts |
| 3 | `registerExportTools` not imported | Added missing import in index.ts |
| 4 | `archiver` package version not found | Downgraded from ^7.1.1 to ^7.0.1 in package.json |
| 5 | `exportAsJson`/`exportAsYaml`/`exportAsZip` not exported | Added alias exports in zip.ts |
| 6 | Duplicate batch function exports | Removed duplicate sync versions, kept async versions |
| 7 | Missing `common.js` module | Created `src/tools/common.ts` with `ToolHandler` interface |

## Resources
<!-- 关键参考资源 -->
- 项目设计文档：`docs/2026-04-27-agentx-design.md`
- 实施计划：
  - `docs/superpowers/plans/2026-04-27-agentx-mvp.md`
  - `docs/superpowers/plans/2026-04-28-agentx-npm-cli.md`
- 源代码目录：`agentx-mcp/src/`
- 测试文件目录：`agentx-mcp/tests/`
- MCP SDK 官方文档：https://github.com/modelcontextprotocol/sdk
- Keep a Changelog 规范：https://keepachangelog.com/zh-CN/1.1.0/

## Visual/Browser Findings
<!-- 暂无浏览器/图像发现 -->

---

*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*
