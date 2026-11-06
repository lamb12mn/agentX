import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'agentx-mcp/package.json'), 'utf8'));
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const nodeMajor = pkg.engines.node.replace(/[^0-9]/g, '');

const checks = [
  [`README version badge matches ${pkg.version}`, readme.includes(`version-${pkg.version}-green.svg`)],
  [`README Node badge matches engines.node (${pkg.engines.node})`, readme.includes(`node-%3E%3D${nodeMajor}-brightgreen.svg`)],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

if (checks.some(([, ok]) => !ok)) {
  process.exit(1);
}
