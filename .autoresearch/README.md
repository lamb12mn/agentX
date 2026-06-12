# .autoresearch 目录

此目录包含自动化研究或评分相关的脚本。

## 文件列表
```
[FILE] score.js
```

## score.js 简介
```javascript
[Reading 112 lines from start (total: 112 lines, 0 remaining)]

#!/usr/bin/env node
/**
 * AgentX 项目评分脚本
 * 输出 0-100 综合评分
 */

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const projectRoot = process.cwd();
const agentxDir = join(projectRoot, 'agentx-mcp');

console.log('=== AgentX 项目评分 ===\n');

let totalScore = 0;
const scores = {};

// 1. TypeScript 编译检查 (30分)
console.log('[1/4] TypeScript 编译检查...');
try {
  execSync('
...
```

## 用途
根据代码判断，此脚本可能用于对某些输出进行自动评分或自动化分析。如果不再需要，可以安全移除此目录。

## 维护建议
- 若为临时工具，可移入 `docs/archive` 或删除
- 若长期使用，请补充详细注释和单元测试
