# 贡献指南

感谢您对 **AgentX** 项目感兴趣！我们欢迎所有形式的贡献，无论是新功能、错误修复、文档改进还是问题反馈。

本指南将帮助您快速设置开发环境并了解我们的开发流程。

## 📋 目录

- [开发环境设置](#开发环境设置)
- [代码规范](#代码规范)
- [测试要求](#测试要求)
- [提交与 PR 流程](#提交与-pr-流程)
- [开发工作流](#开发工作流)
- [项目结构](#项目结构)
- [常见任务](#常见任务)
- [社区准则](#社区准则)

---

## 开发环境设置

### 前置要求

- **Node.js**: >= 18.0.0（推荐使用 20.x LTS）
- **npm**: >= 9.0.0（或使用 pnpm/yarn）
- **Git**: 用于版本控制
- **操作系统**: Windows / macOS / Linux 均可

### 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/agentx.git
cd agentx

# 2. 安装依赖（在 agentx-mcp 目录）
cd agentx-mcp
npm install

# 3. 构建项目
npm run build

# 4. 运行测试
npm test

# 5. 启动 MCP 服务器（用于开发）
npm start
```

### 使用 pnpm（推荐）

```bash
# 如果使用 pnpm
pnpm install
pnpm build
pnpm test
```

### 开发模式

目前项目使用构建-运行模式（无热重载）。开发时建议：

```bash
# 终端 1：监听文件变化并自动构建
npm run build -- --watch

# 终端 2：运行构建后的代码
npm start
```

---

## 代码规范

### TypeScript 配置

项目使用严格的 TypeScript 配置：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,           // 严格模式
    "esModuleInterop": true
  }
}
```

**必须遵守的规则：**

1. **所有文件必须使用严格类型**：禁止使用 `any` 类型（除非有充分理由）
2. **启用所有严格检查**：`strict: true` 包含：
   - `noImplicitAny`: 禁止隐式 any
   - `strictNullChecks`: 严格的 null 检查
   - `strictFunctionTypes`: 严格的函数类型检查
3. **导入/导出使用 ES 模块语法**：
   ```typescript
   // ✅ 正确
   import { Something } from './module.js';
   export default class MyClass {}

   // ❌ 错误（不要使用 CommonJS require）
   const something = require('./module');
   ```

### 命名约定

| 元素 | 约定 | 示例 |
|------|------|------|
| 文件（工具） | kebab-case | `skill-tools.ts` |
| 文件（测试） | kebab-case + `.test.ts` | `skills.test.ts` |
| 类 | PascalCase | `SkillManager` |
| 接口 | PascalCase + `I` 前缀可选 | `AssetMeta` 或 `IAssetMeta` |
| 函数/变量 | camelCase | `createSkill` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| 私有字段 | `_` 前缀 | `_privateField` |

### 目录结构

```
agentx-mcp/
├── src/
│   ├── index.ts              # MCP 服务器入口
│   ├── cli.ts                # CLI 工具入口
│   ├── store/                # 数据层
│   │   ├── db.ts             # SQLite 数据库
│   │   └── assets.ts         # 资产管理
│   ├── tools/                # MCP 工具注册
│   │   ├── skills.ts
│   │   ├── prompts.ts
│   │   ├── rules.ts
│   │   ├── mcps.ts
│   │   ├── agents.ts
│   │   ├── workflows.ts
│   │   ├── search.ts
│   │   └── import.ts
│   └── types/                # 共享类型定义
│       └── index.ts
├── tests/
│   ├── store/                # 存储层测试
│   ├── tools/                # 工具层测试
│   └── fixtures/             # 测试数据
├── dist/                     # 构建输出（gitignore）
└── package.json
```

### 代码风格

**缩进与空格：**
- 使用 **2 个空格**缩进
- 行尾 **不**要有分号（根据项目现有风格）
- 字符串使用 **单引号** `'`

**导入顺序：**
```typescript
// 1. Node.js 内置模块
import { homedir } from 'os';
import { join } from 'path';

// 2. 第三方库
import { Server } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';

// 3. 项目内部模块
import { AssetMeta } from '../types';
import { getAsset } from '../store/assets';
```

**错误处理：**
```typescript
// ✅ 使用 try-catch 处理同步操作
try {
  const result = db.getAsset(id);
  return result;
} catch (error) {
  logger.error('Failed to get asset:', error);
  throw new Error(`Asset not found: ${id}`);
}

// ✅ 异步操作记得 await
const assets = await listAssets();
```

**注释规范：**
```typescript
/**
 * 创建新的技能资产
 * @param name - 技能名称（必须唯一）
 * @param content - Markdown 格式的技能内容
 * @param tags - 标签数组，用于分类和搜索
 * @returns 创建的资产元数据
 * @throws {AssetExistsError} 当技能已存在时
 */
export function createSkill(
  name: string,
  content: string,
  tags?: string[]
): AssetMeta {
  // 实现...
}
```

---

## 测试要求

### 测试框架

- **Vitest**: 快速、现代的测试框架
- **测试位置**: `tests/` 目录，与源代码结构平行
- **测试文件命名**: `*.test.ts`

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式（开发时）
npm test -- --watch

# 覆盖率报告
npm test -- --coverage

# 仅运行特定文件
npm test -- skills.test.ts
```

### 测试结构

**示例测试文件：**
```typescript
// tests/store/assets.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, getAsset, createAsset } from '../src/store/assets';

describe('Asset Store', () => {
  beforeEach(() => {
    // 每个测试前清空数据库
    initDb(':memory:');
  });

  it('should create a new asset', () => {
    const asset = createAsset({
      type: 'skill',
      name: 'test-skill',
      content: '# Test Skill',
    });

    expect(asset).toBeDefined();
    expect(asset.name).toBe('test-skill');
  });

  it('should throw when asset name already exists', () => {
    createAsset({ name: 'duplicate', content: '...' });

    expect(() =>
      createAsset({ name: 'duplicate', content: '...' })
    ).toThrow('Asset already exists');
  });
});
```

### 测试覆盖率目标

- **核心业务逻辑**: >= 90%
- **工具函数**: >= 85%
- **UI/CLI 层**: >= 75%

使用 `npm test -- --coverage` 查看报告。

### 编写新测试

**原则：**
1. **测试行为而非实现**：关注输入-输出，而非内部细节
2. **每个测试一个断言**（理想情况）
3. **使用描述性测试名**：`it('should do X when Y happens')`
4. **Mock 外部依赖**：数据库、文件系统使用临时资源

**测试数据：**
- 使用 `beforeEach` 清理状态
- 测试数据放在 `tests/fixtures/` 目录
- 大型数据集使用工厂函数生成

---

## 提交与 PR 流程

### Git 工作流

我们采用 **GitHub Flow**：

```
main (保护分支)
  ├── feature/xxx  (功能分支)
  ├── fix/xxx      (修复分支)
  └── docs/xxx     (文档分支)
```

### 分支命名

| 分支类型 | 命名格式 | 示例 |
|---------|---------|------|
| 新功能 | `feature/short-desc` | `feature/add-search-filter` |
| Bug 修复 | `fix/short-desc` | `fix/mcp-export-error` |
| 文档 | `docs/short-desc` | `docs/update-api-ref` |
| 重构 | `refactor/short-desc` | `refactor/simplify-db-layer` |

### 提交信息规范

使用 **Conventional Commits** 格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型（type）：**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档变更
- `style`: 代码格式调整（不影响功能）
- `refactor`: 代码重构
- `test`: 添加/修改测试
- `chore`: 构建/工具链变更

**示例：**
```bash
# 好例子 ✅
feat(skills): add tag filtering to list skills
fix(agents): prevent crash when agent config is invalid
docs(api): update create_agent parameter description

# 避免 ❌
"fixed bug"
"updated stuff"
"wip"
```

### PR 模板

在提交 PR 前，请填写以下信息：

```markdown
## 变更描述
简要描述本次 PR 的目的和影响范围。

## 类型
- [ ] 🚀 feat: 新功能
- [ ] 🐛 fix: Bug 修复
- [ ] 📚 docs: 文档更新
- [ ] ♻️ refactor: 代码重构
- [ ] ✅ test: 测试相关
- [ ] 🔧 chore: 构建/工具链

## 检查清单
- [ ] 代码符合代码规范（运行 `npm run lint`）
- [ ] 测试通过（运行 `npm test`）
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 提交信息符合 Conventional Commits 规范

## 测试步骤
1. 
2. 
3. 

## 相关 Issue
Closes #123
```

### PR 审查流程

1. **自动化检查**：CI 运行构建 + 测试
2. **代码审查**：至少一名维护者审查
3. **反馈修改**：根据评论修改代码
4. **合并**：通过后由维护者合并到 main

**审查重点：**
- 功能正确性
- 代码质量和可维护性
- 测试覆盖率
- 向后兼容性（如有）

---

## 开发工作流

### 本地开发

```bash
# 1. 从 main 创建功能分支
git checkout main
git pull origin main
git checkout -b feature/my-feature

# 2. 开发中频繁提交
git add .
git commit -m "feat(module): add new feature"

# 3. 推送分支并创建 PR
git push origin feature/my-feature
# 然后在 GitHub 创建 PR
```

### 调试技巧

**MCP 服务器调试：**
```bash
# 启用详细日志
AGENTX_LOG_LEVEL=debug npm start

# 查看数据库内容
npx better-sqlite3 ~/.agentx/agentx.db "SELECT * FROM assets LIMIT 10;"
```

**CLI 调试：**
```bash
# 使用 tsx 直接运行（无需构建）
npx tsx agentx-mcp/src/cli.ts list-skills

# 使用 Node.js inspect
node --inspect-brk dist/cli.js list-skills
```

### 性能分析

```bash
# 使用 0x 生成火焰图
npx 0x dist/index.js

# 使用 clinic.js
npx clinic doctor -- node dist/index.js
```

---

## 项目结构

### 核心模块说明

| 目录/文件 | 职责 | 主要导出 |
|-----------|------|---------|
| `src/store/db.ts` | SQLite 数据库初始化、表结构 | `initDb`, `getDb` |
| `src/store/assets.ts` | 资产 CRUD 操作 | `createAsset`, `getAsset`, `listAssets` |
| `src/tools/skills.ts` | Skill MCP 工具注册 | `registerSkillTools` |
| `src/tools/agents.ts` | Agent MCP 工具注册 | `registerAgentTools` |
| `src/index.ts` | MCP 服务器主入口 | `main` 函数 |
| `src/cli.ts` | CLI 命令定义 | `program` (commander) |

### 数据流

```
用户输入 (CLI/MCP)
    ↓
解析参数 (commander/zod)
    ↓
验证输入 (zod schema)
    ↓
业务逻辑层 (assets.ts)
    ↓
数据访问层 (db.ts)
    ↓
SQLite 数据库
```

### 类型定义

所有公共类型定义在 `src/types/index.ts`：

```typescript
export interface AssetMeta {
  id: string;
  type: AssetType;
  name: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export type AssetType = 'skill' | 'prompt' | 'rule' | 'mcp' | 'workflow' | 'agent';
```

**新增类型时：**
1. 在 `src/types/index.ts` 定义
2. 导出类型（`export type` 或 `export interface`）
3. 在相关模块中导入使用

---

## 常见任务

### 添加新的资产类型

例如添加 `"template"` 类型：

1. **更新类型定义** (`src/types/index.ts`)：
   ```typescript
   export type AssetType = 'skill' | 'prompt' | ... | 'template';
   ```

2. **创建工具文件** (`src/tools/templates.ts`)：
   ```typescript
   export function registerTemplateTools(baseDir: string) {
     return {
       list_templates: { /* ... */ },
       get_template: { /* ... */ },
       // ...
     };
   }
   ```

3. **在主入口注册** (`src/index.ts`)：
   ```typescript
   import { registerTemplateTools } from './tools/templates.js';
   const templateTools = registerTemplateTools(baseDir);
   ```

4. **添加 CLI 支持** (`src/cli.ts`)：
   ```typescript
   program.command('list-templates', ...);
   ```

5. **编写测试** (`tests/tools/templates.test.ts`)

6. **更新文档** (`docs/API_REFERENCE.md`, `docs/USER_GUIDE.md`)

### 修改数据库 schema

1. 修改 `src/store/db.ts` 中的 `initDb` 函数
2. 添加迁移脚本（可选，见 `docs/CONFIGURATION.md`）
3. 更新相关 TypeScript 类型
4. 修改测试数据
5. 更新 `docs/CONFIGURATION.md` 中的数据库 schema 说明

### 添加新 MCP 工具

参考现有工具文件（如 `src/tools/skills.ts`）：

```typescript
export function registerSkillTools(baseDir: string) {
  return {
    list_skills: {
      description: 'List all skills',
      inputSchema: {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' } }
        }
      },
      handler: async (input) => {
        // 实现
        return { skills: [...] };
      }
    }
  };
}
```

---

## 社区准则

### 行为准则

我们致力于提供一个友好、安全的社区环境：

- **尊重他人**：礼貌、耐心、理解
- **建设性反馈**：对代码和想法提出改进建议
- **包容性**：欢迎所有背景的贡献者
- **专业精神**：保持讨论聚焦于技术和项目

### 提问与讨论

- **GitHub Issues**: 用于 Bug 报告和功能请求
- **GitHub Discussions**: 用于一般性问题和讨论
- **文档**: 先查阅文档再提问

### 报告 Bug

请使用 [Bug 报告模板](https://github.com/your-org/agentx/issues/new?template=bug_report.yml)，包含：

1. **环境信息**：Node.js 版本、操作系统
2. **复现步骤**：清晰列出操作步骤
3. **预期行为**：应该发生什么
4. **实际行为**：实际发生了什么
5. **日志/截图**：错误信息或截图

### 功能请求

- 先搜索是否已有类似请求
- 描述 **使用场景** 而不仅仅是功能
- 说明为什么这个功能对项目有价值
- 提供实现思路（可选）

---

## 获取帮助

- **文档**: 查阅 `docs/` 目录
- **示例**: 查看 `docs/EXAMPLES/` 中的示例资产
- **问题**: 在 GitHub Discussions 提问
- **实时聊天**：（可选）加入我们的 Discord/Slack

---

## 许可证

本项目采用 **ISC 许可证**。贡献即表示您同意您的代码将在 ISC 许可证下发布。

---

**再次感谢您的贡献！** 🎉

如有疑问，请随时在 GitHub Discussions 中提问。
