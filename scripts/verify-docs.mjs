import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const pkg = JSON.parse(read('agentx-mcp/package.json'));
const readme = read('README.md');
const contributing = read('CONTRIBUTING.md');
const apiRef = read('docs/API_REFERENCE.md');
const nodeMajor = pkg.engines.node.replace(/[^0-9]/g, '');

// 与 src/index.ts 的 allTools 组装一致：取注册对象里带 description 的顶层键
function toolKeys(src) {
  const lines = src.split(/\r?\n/);
  const keys = new Set();
  lines.forEach((line, i) => {
    const m = line.match(/^\s{2,8}('?[a-zA-Z_][\w.]*'?)\s*:\s*\{\s*$/);
    if (!m || !/description\s*:/.test(lines.slice(i + 1, i + 5).join('\n'))) return;
    const key = m[1].replace(/'/g, '');
    // 工具名均为 snake_case 或带命名空间前缀；排除 inputSchema / properties 等 schema 键
    if (key.includes('_') || key.includes('.')) keys.add(key);
  });
  return keys;
}

const toolsDir = 'agentx-mcp/src/tools';
const baseTools = new Set();
for (const f of readdirSync(join(root, toolsDir)).filter((f) => f.endsWith('.ts'))) {
  for (const key of toolKeys(read(join(toolsDir, f)))) baseTools.add(key);
}
const enhancedTools = [...toolKeys(read('agentx-mcp/src/index.ts'))].filter((k) => k.includes('.'));

const cliDir = 'agentx-mcp/src/cli';
const cliSources = readdirSync(join(root, cliDir), { recursive: true })
  .filter((f) => String(f).endsWith('.ts'))
  .map((f) => read(join(cliDir, String(f))));
cliSources.push(read('agentx-mcp/src/cli.ts'));
const registeredCommands = new Set(
  cliSources.flatMap((src) => [...src.matchAll(/\.command\(['"]([a-z-]+)/g)].map((m) => m[1]))
);
const cliTable = readme.match(/\| 分组 \| 命令 \|[\s\S]*?\n\n下列为常用命令/)?.[0] ?? '';
const documentedCommands = [...cliTable.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
const unknownCommands = documentedCommands.filter((c) => !registeredCommands.has(c));

const localLinks = [...`${readme}\n${contributing}\n${apiRef}`.matchAll(/\]\(([^)]+)\)/g)]
  .map((m) => m[1].split('#')[0])
  .filter((h) => h && !/^https?:|^mailto:/.test(h));
const brokenLinks = [...new Set(localLinks)].filter((h) => !existsSync(join(root, h)));

const declaredBase = Number(readme.match(/基础模式注册 \*\*(\d+) 个工具\*\*/)?.[1]);
const declaredEnhanced = Number(readme.match(/额外注册 \*\*(\d+) 个增强工具\*\*/)?.[1]);
const declaredCli = Number(readme.match(/共有 \*\*(\d+) 个顶层命令\*\*/)?.[1]);

// 默认暴露集：核心工具名必须真实注册，README 声明数量须与 CORE_TOOLS + discover_tools 一致
const catalogSource = read('agentx-mcp/src/tools/catalog.ts');
const coreBlock = catalogSource.match(/export const CORE_TOOLS[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
const coreNames = [...coreBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const allToolNames = new Set([...baseTools, ...enhancedTools]);
const unknownCore = coreNames.filter((name) => !allToolNames.has(name));
const metaBlock = catalogSource.match(/export const META_TOOLS[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
const metaNames = [...metaBlock.matchAll(/([A-Z][A-Z_0-9]*)/g)]
  .map((m) => catalogSource.match(new RegExp(`export const ${m[1]}[^=]*=\\s*'([^']+)'`))?.[1])
  .filter(Boolean);
const unknownMeta = metaNames.filter((name) => !allToolNames.has(name));
const undocumentedMeta = metaNames.filter(
  (name) => !readme.includes(`\`${name}\``) || !apiRef.includes(`\`${name}\``),
);
const declaredExposed = Number(readme.match(/默认只在 `tools\/list` 暴露 (\d+) 个/)?.[1]);
const missingInApiRef = [...baseTools, ...enhancedTools].filter((k) => !apiRef.includes(`\`${k}\``));

// 意图路由：文档必须覆盖，且自动执行白名单不得混入任何写操作前缀
const intentSource = read('agentx-mcp/src/tools/intent.ts');
const readonlyPattern = intentSource.match(/const READ_ONLY_TOOL = \/(.+?)\/;/)?.[1] ?? '';
const writePrefixLeak = /(create_|update_|delete_|clear_|rollback_|apply_|batch_|ai_)/.test(readonlyPattern);
const intentDocumented = readme.includes('`match_tools`') && apiRef.includes('### 2.4 意图路由');
const autoExecuteGuarded = /META_TOOLS\.includes\(best\.name\)/.test(intentSource)
  && /READ_ONLY_TOOL\.test\(best\.name\)/.test(intentSource);

// 工具列表各分组声明的个数之和应与源码一致（排除「增强模式追加」分组）
const toolSection = readme.split('#### 可用工具列表')[1]?.split('\n---')[0] ?? '';
const groupCounts = [...toolSection.matchAll(/^\*\*(?!增强模式追加)([^*]+)\*\*（(\d+) 个）/gm)]
  .map((m) => Number(m[2]));
const groupSum = groupCounts.reduce((sum, n) => sum + n, 0);

// AI provider 接线与工作流执行：源码与文档不得再次漂移
const aiEnvVars = ['AGENTX_AI_API_KEY', 'AGENTX_AI_BASE_URL', 'AGENTX_AI_MODEL'];
const missingAiEnvVars = aiEnvVars.filter(
  (name) => !readme.includes(`\`${name}\``) || !apiRef.includes(`\`${name}\``),
);
const restSource = read('agentx-mcp/src/api/rest-api.ts');
const staleWorkflowStub = restSource.includes('not_implemented')
  || /固定返回 `status: 'not_implemented'`/u.test(apiRef)
  || /目前返回 `status: not_implemented`/u.test(readme);

const checks = [
  [`README version badge matches ${pkg.version}`, readme.includes(`version-${pkg.version}-green.svg`)],
  [`README Node badge matches engines.node (${pkg.engines.node})`, readme.includes(`node-%3E%3D${nodeMajor}-brightgreen.svg`)],
  [`README base tool count matches source (${baseTools.size})`, declaredBase === baseTools.size],
  [`README tool group counts sum matches source (${baseTools.size})`, groupCounts.length >= 5 && groupSum === baseTools.size, `groups=${groupCounts.join('+')} sum=${groupSum}`],
  [`README enhanced tool count matches source (${enhancedTools.length})`, declaredEnhanced === enhancedTools.length],
  [`API_REFERENCE lists every registered tool`, missingInApiRef.length === 0, missingInApiRef.join(', ')],
  [`README CLI count matches documented commands (${documentedCommands.length})`, declaredCli === documentedCommands.length],
  [`every documented CLI command exists in source`, unknownCommands.length === 0, unknownCommands.join(', ')],
  [`CONTRIBUTING Node version matches engines.node`, contributing.includes(`>= ${nodeMajor}.0.0`)],
  [`AI provider env vars documented in README and API_REFERENCE`, missingAiEnvVars.length === 0, missingAiEnvVars.join(', ')],
  [`workflow execute is implemented and docs reflect it`, !staleWorkflowStub],
  [`all local markdown links resolve`, brokenLinks.length === 0, brokenLinks.join(', ')],
  [`CORE_TOOLS entries are all registered (${coreNames.length})`, coreNames.length > 0 && unknownCore.length === 0, unknownCore.join(', ')],
  [`README default exposure count matches CORE_TOOLS + META_TOOLS (${coreNames.length + metaNames.length})`, declaredExposed === coreNames.length + metaNames.length],
  [`META_TOOLS are registered and documented (${metaNames.length})`, metaNames.length >= 2 && unknownMeta.length === 0 && undocumentedMeta.length === 0, [...unknownMeta, ...undocumentedMeta].join(', ')],
  [`intent routing is documented and auto-execution excludes writes`, intentDocumented && autoExecuteGuarded && !!readonlyPattern && !writePrefixLeak, `documented=${intentDocumented} guarded=${autoExecuteGuarded} writeLeak=${writePrefixLeak}`],
];

for (const [label, ok, detail] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
}

if (checks.some(([, ok]) => !ok)) process.exit(1);
