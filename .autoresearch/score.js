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
  execSync('npx tsc --noEmit', { cwd: agentxDir, stdio: 'pipe' });
  scores.tsc = 30;
  console.log('  ✅ 编译通过 (30/30)');
} catch (e) {
  const errorMatch = e.message?.match(/(\d+) error/);
  const errorCount = errorMatch ? parseInt(errorMatch[1]) : 10;
  const score = Math.max(0, 30 - errorCount * 3);
  scores.tsc = score;
  console.log(`  ⚠️ ${errorCount} 错误 (${score}/30)`);
}

// 2. 测试通过率检查 (30分)
console.log('[2/4] 测试通过率检查...');
try {
  const testOutput = execSync('npx vitest run --reporter=verbose 2>&1', { cwd: agentxDir, stdio: 'pipe', encoding: 'utf-8' });
  // vitest v4 格式: "✓ tests/xxx.test.ts (N tests)" 或 "Tests  N passed"
  const passedMatch = testOutput.match(/(\d+)\s+passed/);
  const failedMatch = testOutput.match(/(\d+)\s+failed/);
  const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
  const total = passed + failed;
  if (total > 0 && failed === 0) {
    scores.test = 30;
    console.log(`  ✅ ${passed}/${passed} tests passed (30/30)`);
  } else if (total > 0) {
    const ratio = passed / total;
    scores.test = Math.round(30 * ratio);
    console.log(`  ⚠️ ${passed}/${total} tests passed (${scores.test}/30)`);
  } else {
    scores.test = 0;
    console.log('  ❌ No tests found (0/30)');
  }
} catch (e) {
  scores.test = 0;
  console.log('  ❌ Test execution failed (0/30)');
}
// 3. 代码规范检查 (20分)
console.log('[3/4] 代码规范检查...');
let normScore = 0;
if (existsSync(join(agentxDir, '.eslintrc.json')) ||
    existsSync(join(agentxDir, '.eslintrc.js')) ||
    existsSync(join(agentxDir, 'eslint.config.mjs'))) {
  normScore += 5;
}
if (existsSync(join(agentxDir, '.prettierrc')) ||
    existsSync(join(agentxDir, '.prettierrc.json'))) {
  normScore += 5;
}
if (existsSync(join(agentxDir, 'vitest.config.ts')) ||
    existsSync(join(agentxDir, 'vitest.config.js'))) {
  normScore += 5;
}
if (existsSync(join(agentxDir, '.editorconfig'))) {
  normScore += 5;
}
scores.norm = normScore;
console.log(`  ${normScore > 0 ? '✅' : '⚠️'} ${normScore}/20 配置检查`);

// 4. 文档完整性 (20分)
console.log('[4/4] 文档完整性检查...');
let docScore = 0;
const requiredDocs = [
  'README.md',
  'CONTRIBUTING.md', 
  'CHANGELOG.md',
  'docs/USER_GUIDE.md',
  'docs/API_REFERENCE.md',
  'docs/CONFIGURATION.md',
  'docs/TROUBLESHOOTING.md',
  'docs/ARCHITECTURE.md'
];
let found = 0;
for (const doc of requiredDocs) {
  if (existsSync(join(projectRoot, doc))) {
    found++;
  }
}
docScore = Math.round((found / requiredDocs.length) * 20);
scores.doc = docScore;
console.log(`  ✅ ${found}/${requiredDocs.length} 文档 (${docScore}/20)`);

// 总分
totalScore = scores.tsc + scores.test + scores.norm + scores.doc;

console.log('\n=== 评分结果 ===');
console.log(`TypeScript 编译: ${scores.tsc}/30`);
console.log(`测试通过率:   ${scores.test}/30`);
console.log(`代码规范:     ${scores.norm}/20`);
console.log(`文档完整性:   ${scores.doc}/20`);
console.log(`─────────────────`);
console.log(`综合评分:     ${totalScore}/100`);

process.exit(0);