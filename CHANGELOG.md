# 更新日志

本文档记录 AgentX 项目的所有重大变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [1.0.0] - 2026-04-29

### 新增 ✨

#### 核心功能（Phase 1-8 完成）

**资产管理系统**
- 支持 6 种资产类型的完整 CRUD 操作：
  - **Skill**（技能）: `.md` 文件，定义 AI 助手的技能和能力
  - **Prompt**（提示词）: `.md` 文件，标准化提示词模板
  - **Rule**（规则）: `.md` 文件，编码规范和约束
  - **MCP**（MCP 配置）: `.json` 文件，MCP 服务器配置
  - **Workflow**（工作流）: `.yaml` 文件，多步骤工作流
  - **Agent**（智能体）: `agent.yaml` 文件，完整智能体配置
- 资产以独立文件形式存储，支持 Git 版本控制
- 基于 SQLite 的元数据管理，包含创建时间、更新时间、标签等
- 资产名称在同一类型内唯一性约束

**MCP 服务器（33 个工具）**
- 完整实现 Model Context Protocol 1.0 规范
- 暴露 33 个 MCP 工具，分为 8 个类别：
  - Skill 工具（5个）: `list_skills`, `get_skill`, `create_skill`, `update_skill`, `delete_skill`
  - Prompt 工具（5个）: `list_prompts`, `get_prompt`, `create_prompt`, `update_prompt`, `delete_prompt`
  - Rule 工具（5个）: `list_rules`, `get_rule`, `create_rule`, `update_rule`, `delete_rule`
  - MCP 工具（5个）: `list_mcps`, `get_mcp`, `create_mcp`, `update_mcp`, `delete_mcp`
  - Agent 工具（6个）: `list_agents`, `get_agent`, `create_agent`, `update_agent`, `delete_agent`, `export_agent`
  - Workflow 工具（5个）: `list_workflows`, `get_workflow`, `create_workflow`, `update_workflow`, `delete_workflow`
  - 搜索工具（1个）: `search_assets` - 全文搜索
  - 导入工具（1个）: `import_from_claude` - 从 Claude Code 导入
- 支持 stdio 传输（标准输入/输出）
- 自动发现和注册所有工具

**CLI 命令行工具（7 个命令）**
- `agentx list [type]` - 列出所有资产（可按类型过滤：skill|prompt|rule|mcp|workflow|agent）
- `agentx search <query>` - 全文搜索资产（支持 `--limit` 选项）
- `agentx info` - 显示资产库统计信息
- `agentx get <id>` - 查看资产详情和内容（`--content` 显示内容）
- `agentx delete <id>` - 删除资产（`--yes` 跳过确认）
- `agentx export <id>` - 导出智能体为 Claude Code 格式（仅支持 agent 类型）
- `agentx import <type>` - 从 Claude Code 导入资产（支持 skill|prompt|rule）
- 支持 JSON/YAML 输出格式（通过环境变量配置）

**存储系统**
- SQLite 数据库（`better-sqlite3`）存储资产元数据
- FTS5 虚拟表实现全文搜索
- 触发器自动维护搜索索引同步
- 双索引优化：`idx_assets_type`（类型索引）、`idx_assets_name`（名称索引）
- 本地优先存储：默认 `~/.agentx/` 目录（可通过 `AGENTX_DIR` 环境变量覆盖）
- 原子性操作：创建/删除事务保证数据一致性

**导入/导出功能**
- 导出为 Claude Code 兼容格式（单个 JSON 文件）
- 导出为 ZIP 归档（包含所有资产文件）
- 从 Claude Code 导出文件批量导入
- 导入时自动去重和合并策略

**配置系统**
- 环境变量支持：
  - `AGENTX_DIR`: 数据目录路径（默认 `~/.agentx/`）
  - `NODE_ENV`: 运行环境（development/production）
- 自动创建目录结构
- 配置文件格式支持：JSON（MCP）、YAML（Workflow/Agent）、Markdown（Skill/Prompt/Rule）

### 改进 🎨

#### 开发体验
- **TypeScript 严格模式**: 启用所有严格类型检查
- **模块系统**: ES2022 模块，Node16 模块解析
- **构建系统**: 简单 `tsc` 编译到 `dist/` 目录
- **测试框架**: Vitest 提供快速单元测试
- **类型安全**: 所有公共 API 有完整 TypeScript 类型定义
- **错误处理**: 统一的错误消息和退出码

#### 代码质量
- **单一职责**: 每个模块职责清晰分离
- **依赖注入**: 通过 `baseDir` 参数传递配置
- **验证层**: Zod schema 验证所有输入
- **日志友好**: 清晰的错误消息和调试信息

### 文档 📚

**Phase 9-10 文档体系（本次发布包含）**
- **README.md**: 项目首页，包含快速开始、安装、基本用法、徽章、FAQ
- **CONTRIBUTING.md**: 贡献指南，涵盖开发环境、代码规范、测试、PR 流程
- **CHANGELOG.md**: 版本历史记录（本文档）
- **用户指南** (`docs/USER_GUIDE.md`):
  - 5 分钟快速入门教程
  - 8 个 CLI 命令详解
  - MCP 集成指南（Claude Code、Claude Desktop）
  - 6 种资产类型深度解析
  - 导出与分享说明
  - 真实场景用例（代码助手、技术写作、数据分析）
  - 高级技巧与最佳实践
- **API 参考** (`docs/API_REFERENCE.md`):
  - 33 个 MCP 工具的完整接口文档
  - 每个工具包含：描述、输入 schema、参数说明、返回值、示例代码、注意事项
  - 通用数据类型定义（`AssetMeta`, `AssetType`, `AgentConfig`, `McpConfig`, `SearchResult`, `ImportResult`）
- **配置说明** (`docs/CONFIGURATION.md`):
  - 环境变量详解
  - 目录结构树
  - 数据库 schema 说明（表结构、索引、触发器）
  - 配置文件格式（MCP JSON、Agent YAML、Skill/Prompt/Rule Markdown、Workflow YAML）
  - MCP 服务器配置（Claude Code、Claude Desktop、其他客户端）
  - CLI 配置（帮助、别名、输出格式）
  - 高级配置（符号链接、多配置文件、性能调优、权限）
- **故障排除** (`docs/TROUBLESHOOTING.md`):
  - 17 个常见问题场景（分类：安装、CLI、MCP 集成、数据库、资产、导出、性能）
  - 每个问题包含：症状、原因、诊断步骤、解决方案（带命令）
  - 错误代码参考表（`ASSET_NOT_FOUND`, `PARSE_ERROR`, `DB_ERROR`, `VALIDATION_ERROR`, `IO_ERROR`, `DUPLICATE_ASSET`）
  - 诊断信息收集指南
  - 重置与恢复流程
- **架构设计** (`docs/ARCHITECTURE.md`):
  - 系统架构图（Mermaid 图表）
  - 架构原则（单一职责、依赖倒置、数据本地化、向后兼容）
  - 核心模块详解（入口模块、存储层、工具注册层、CLI 层）
  - 数据流序列图（MCP 调用、CLI 导出）
  - 存储设计（数据库 schema、文件系统布局、一致性保证）
  - 扩展点（新增资产类型、自定义工具、插件系统规划）
  - 技术选型对比表
  - 部署模式（全局安装、本地开发、npx、库集成）
  - 性能与安全说明
  - 未来规划（短期、中期、长期）

### 修复 🐛

#### 数据库层
- 修复 FTS5 触发器在更新时未同步 `description` 的问题（已通过 `COALESCE` 处理 NULL）
- 修复资产删除时 FTS 索引未清理的问题（已添加 DELETE 触发器）
- 修复 `getAssetByName` 在资产不存在时返回 `undefined` 而非抛出错误（已统一异常处理）

#### CLI 工具
- 修复 `list-*` 命令未正确过滤类型的问题（已通过 `type` 参数固定）
- 修复导出路径包含空格时的处理（已使用 `path.join` 安全拼接）
- 修复导入重复资产时的冲突处理（添加 `--merge` 选项）

#### MCP 服务器
- 修复工具描述国际化问题（统一英文描述，兼容多语言客户端）
- 修复工具处理器类型断言（`unknown` → 具体类型）
- 修复服务器启动时数据库未初始化的竞态条件（已确保 `initDb` 先执行）

### 测试 ✅

- **单元测试覆盖核心模块**：
  - `tests/store/assets.test.ts` - 资产 CRUD 操作（20+ 测试用例）
  - `tests/store/db.test.ts` - 数据库初始化和 FTS（10+ 测试用例）
  - `tests/tools/skills.test.ts` - Skill 工具集成测试（15+ 测试用例）
  - `tests/tools/agents.test.ts` - Agent 工具集成测试（12+ 测试用例）
- **类型检查**: `npx tsc --noEmit` 零错误通过
- **测试覆盖率**: 核心业务逻辑 >= 90%

### 构建与打包 📦

- **TypeScript 编译**: `npm run build` 生成 `dist/` 目录
- **二进制文件**:
  - `agentx-mcp` (MCP 服务器)
  - `agentx` (CLI 工具)
- **发布就绪**: `prepublishOnly` 脚本确保构建和测试通过
- **平台支持**: Windows/macOS/Linux（Node.js 跨平台）

---

## [未发布] - 即将推出

### 新增（规划中）

- **插件系统**: 支持第三方扩展和自定义钩子
- **资产同步**: 通过 Git 或云存储在多设备间同步
- **Web 管理界面**: 本地 HTTP 服务器的可视化 UI
- **模板市场**: 官方和社区维护的资产模板库
- **多用户支持**: 团队协作和权限管理
- **工作流引擎**: 可视化工作流编辑和执行
- **智能推荐**: 基于使用模式的资产推荐

### 改进（规划中）

- **热重载**: 开发时文件变更自动重载
- **资产版本化**: 内置 Git 风格的版本历史
- **备份恢复**: 自动备份和一键恢复
- **更多导出格式**: Notion、Obsidian、Logseq 兼容
- **云同步**: 可选的企业级云同步（自托管）
- **REST API**: 除 MCP 外提供 HTTP API

---

## 版本说明

### 1.0.0 (当前版本)

**首次正式发布**，包含 Phase 1-8 所有核心功能：

- ✅ MCP 服务器（33 个工具）
- ✅ CLI 工具（8 个命令）
- ✅ 6 种资产类型完整支持
- ✅ SQLite 存储 + FTS5 全文搜索
- ✅ 导入/导出功能
- ✅ 完整测试套件
- ✅ 完整文档体系（Phase 9-10）

**向后兼容性**: 1.0.0 是首个稳定版本，API 已冻结。后续 minor 版本将保持向后兼容。

### 0.x.x 版本（开发阶段）

早期开发阶段版本（未公开发布），已废弃，不保留历史记录。

---

## 升级指南

### 从早期开发版本升级到 1.0.0

**注意**: 0.x 版本为内部开发版本，未公开发布。如果您使用了开发版本，请注意以下变更：

**重大变更**：
1. **配置文件格式**: Agent 配置文件从 `agent.json` 改为 `agent.yaml`
2. **目录结构**: 资产存储从扁平结构改为按类型分目录（`skills/`, `prompts/`, `rules/` 等）
3. **API 统一**: MCP 工具名称标准化为 `list_<type>`, `get_<type>`, `create_<type>` 格式

**迁移步骤**：
```bash
# 1. 备份现有数据（如果使用开发版本）
# 直接复制整个 ~/.agentx/ 目录作为备份
cp -r ~/.agentx ~/.agentx.backup

# 2. 卸载旧版本
npm uninstall -g agentx-mcp

# 3. 安装 1.0.0 正式版
npm install -g agentx-mcp@1.0.0

# 4. 首次运行会自动迁移数据库结构
# 如有问题，请参考 TROUBLESHOOTING.md 的"数据库迁移"章节
```

详细迁移指南见 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#数据库迁移问题)。

---

## 贡献

欢迎提交 Issue 和 Pull Request！

查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何参与开发。

---

**保持更新，持续发布** 🚀
