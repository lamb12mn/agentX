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
const missingInApiRef = [...baseTools, ...enhancedTools].filter((k) => !apiRef.includes(`\`${k}\``));

const checks = [
  [`README version badge matches ${pkg.version}`, readme.includes(`version-${pkg.version}-green.svg`)],
  [`README Node badge matches engines.node (${pkg.engines.node})`, readme.includes(`node-%3E%3D${nodeMajor}-brightgreen.svg`)],
  [`README base tool count matches source (${baseTools.size})`, declaredBase === baseTools.size],
  [`README enhanced tool count matches source (${enhancedTools.length})`, declaredEnhanced === enhancedTools.length],
  [`API_REFERENCE lists every registered tool`, missingInApiRef.length === 0, missingInApiRef.join(', ')],
  [`README CLI count matches documented commands (${documentedCommands.length})`, declaredCli === documentedCommands.length],
  [`every documented CLI command exists in source`, unknownCommands.length === 0, unknownCommands.join(', ')],
  [`CONTRIBUTING Node version matches engines.node`, contributing.includes(`>= ${nodeMajor}.0.0`)],
  [`all local markdown links resolve`, brokenLinks.length === 0, brokenLinks.join(', ')],
];

for (const [label, ok, detail] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
}

if (checks.some(([, ok]) => !ok)) process.exit(1);
