# AgentX npm Packaging + CLI Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package AgentX MCP Server for npm distribution and add a `agentx` CLI companion for managing the local asset library without Claude.

**Architecture:** Two independent entry points (`src/index.ts` for MCP Server, `src/cli.ts` for CLI) share the same `store/` and `export/` layers. CLI uses `commander` for command routing, `chalk` for color, `cli-table3` for table output. Both compile to `dist/` and are registered as `bin` entries in `package.json`.

**Tech Stack:** TypeScript/ESM, commander v12, chalk v5, cli-table3, @inquirer/prompts, Node.js 18+

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add `bin`, `files`, `engines`, description; add CLI deps |
| `src/index.ts` | Modify | Add shebang line |
| `src/cli.ts` | Create | CLI entry point, commander root program |
| `src/cli/format.ts` | Create | Table + color formatting utilities |
| `src/cli/commands/list.ts` | Create | `agentx list [type]` command |
| `src/cli/commands/search.ts` | Create | `agentx search <query>` command |
| `src/cli/commands/info.ts` | Create | `agentx info` command |
| `src/cli/commands/get.ts` | Create | `agentx get <id>` command |
| `src/cli/commands/delete.ts` | Create | `agentx delete <id>` command |
| `src/cli/commands/export.ts` | Create | `agentx export <id>` command |
| `src/cli/commands/import.ts` | Create | `agentx import --type <type>` command |
| `src/cli/commands/create.ts` | Create | `agentx create <type>` interactive command |
| `tsconfig.json` | Verify | Ensure `dist/cli.js` is emitted |

---

## Phase 1A: npm Packaging Config

### Task 1: Update package.json for npm distribution

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install CLI dependencies**

```bash
cd D:\xiaoyue\mcps\agentX\agentx-mcp
npm install commander chalk cli-table3 @inquirer/prompts
npm install --save-dev @types/cli-table3
```

Expected: packages added to `node_modules`, `package.json` updated with new deps.

- [ ] **Step 2: Update package.json fields**

Replace the full `package.json` with:

```json
{
  "name": "agentx-mcp",
  "version": "1.0.0",
  "description": "Local-first agent factory MCP Server for Claude Code",
  "type": "module",
  "bin": {
    "agentx-mcp": "./dist/index.js",
    "agentx": "./dist/cli.js"
  },
  "main": "dist/index.js",
  "files": [
    "dist/",
    "README.md"
  ],
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "prepublishOnly": "npm run build && npm test"
  },
  "keywords": ["mcp", "claude", "agent", "cli"],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "better-sqlite3": "^12.9.0",
    "chalk": "^5.0.0",
    "cli-table3": "^0.6.5",
    "commander": "^12.0.0",
    "js-yaml": "^4.1.1",
    "uuid": "^14.0.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/cli-table3": "^0.6.6",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^25.6.0",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.21.0",
    "typescript": "^6.0.3",
    "vitest": "^4.1.5"
  }
}
```

- [ ] **Step 3: Add shebang to src/index.ts**

Add `#!/usr/bin/env node` as the very first line of `src/index.ts` (before any imports):

```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// ... rest of file unchanged
```

- [ ] **Step 4: Verify build still works**

```bash
cd D:\xiaoyue\mcps\agentX\agentx-mcp
npm run build
```

Expected: `dist/index.js` emitted, 0 TypeScript errors.

- [ ] **Step 5: Run tests to confirm nothing broken**

```bash
npm test
```

Expected: 53 tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json src/index.ts
git commit -m "feat: configure npm packaging with bin entries and CLI deps"
```

---

## Phase 1B: CLI Framework + Core Commands

### Task 2: Create formatting utilities

**Files:**
- Create: `src/cli/format.ts`

- [ ] **Step 1: Create src/cli/format.ts**

```typescript
import chalk from 'chalk';
import Table from 'cli-table3';
import type { AssetMeta, SearchResult } from '../types.js';

export function formatTable(assets: AssetMeta[]): string {
  if (assets.length === 0) return chalk.yellow('No assets found.');

  const table = new Table({
    head: ['ID', 'Name', 'Tags', 'Updated'].map((h) => chalk.cyan(h)),
    colWidths: [10, 22, 20, 10],
    style: { compact: false },
  });

  for (const a of assets) {
    const ago = timeAgo(a.updated_at);
    const tags = a.tags.join(', ') || '-';
    table.push([a.id.slice(0, 8), a.name, tags, ago]);
  }

  return table.toString();
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return chalk.yellow('No results found.');

  const lines = results.map((r) => {
    const score = chalk.green(`[${r.score.toFixed(2)}]`);
    const name = chalk.bold(r.name);
    const type = chalk.dim(`(${r.type})`);
    const desc = r.description ? ` — ${r.description}` : '';
    return `  ${score} ${name} ${type}${desc}`;
  });

  return `Found ${results.length} result${results.length === 1 ? '' : 's'}:\n` + lines.join('\n');
}

export function formatMeta(asset: AssetMeta): string {
  const lines = [
    `${chalk.cyan('ID:')}          ${asset.id}`,
    `${chalk.cyan('Name:')}        ${asset.name}`,
    `${chalk.cyan('Type:')}        ${asset.type}`,
    `${chalk.cyan('Tags:')}        ${asset.tags.join(', ') || '-'}`,
    `${chalk.cyan('Description:')} ${asset.description ?? '-'}`,
    `${chalk.cyan('File:')}        ${asset.file_path}`,
    `${chalk.cyan('Created:')}     ${new Date(asset.created_at).toLocaleString()}`,
    `${chalk.cyan('Updated:')}     ${new Date(asset.updated_at).toLocaleString()}`,
  ];
  return lines.join('\n');
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:\xiaoyue\mcps\agentX\agentx-mcp
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/cli/format.ts
git commit -m "feat: add CLI formatting utilities (table, search, meta)"
```

---

### Task 3: Create CLI entry point and list/search/info commands

**Files:**
- Create: `src/cli.ts`
- Create: `src/cli/commands/list.ts`
- Create: `src/cli/commands/search.ts`
- Create: `src/cli/commands/info.ts`

- [ ] **Step 1: Create src/cli/commands/list.ts**

```typescript
import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { listAssets } from '../../store/assets.js';
import { formatTable } from '../format.js';
import type { AssetType } from '../../types.js';
import chalk from 'chalk';

const VALID_TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'];

export function registerListCommand(program: Command): void {
  program
    .command('list [type]')
    .description('List assets. Type: skill|prompt|rule|mcp|workflow|agent')
    .action(async (type?: string) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      if (type && !VALID_TYPES.includes(type as AssetType)) {
        console.error(chalk.red(`Unknown type: ${type}. Valid: ${VALID_TYPES.join(', ')}`));
        process.exit(1);
      }

      const assets = await listAssets(type as AssetType | undefined);
      console.log(formatTable(assets));
      const label = type ? `${type}s` : 'assets';
      console.log(chalk.dim(`${assets.length} ${label} found.`));
    });
}
```

- [ ] **Step 2: Create src/cli/commands/search.ts**

```typescript
import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { searchAssets } from '../../store/search.js';
import { formatSearchResults } from '../format.js';

export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Full-text search across all assets')
    .option('-l, --limit <n>', 'Max results', '10')
    .action(async (query: string, opts: { limit: string }) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      const results = await searchAssets(query, parseInt(opts.limit, 10));
      console.log(formatSearchResults(results));
    });
}
```

- [ ] **Step 3: Create src/cli/commands/info.ts**

```typescript
import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { statSync } from 'fs';
import { initDb } from '../../store/db.js';
import { listAssets } from '../../store/assets.js';
import chalk from 'chalk';
import type { AssetType } from '../../types.js';

const TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'];

export function registerInfoCommand(program: Command): void {
  program
    .command('info')
    .description('Show asset library statistics')
    .action(async () => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      const dbPath = join(baseDir, 'agentx.db');
      initDb(dbPath);

      const counts: Record<string, number> = {};
      let total = 0;
      for (const t of TYPES) {
        const n = (await listAssets(t)).length;
        counts[t] = n;
        total += n;
      }

      let dbSize = 'unknown';
      try {
        const bytes = statSync(dbPath).size;
        dbSize = bytes < 1024 * 1024
          ? `${Math.round(bytes / 1024)} KB`
          : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
      } catch { /* db may not exist yet */ }

      console.log(chalk.bold(`AgentX Asset Library (${baseDir})`));
      for (const t of TYPES) {
        console.log(`  ${chalk.cyan((t + 's:').padEnd(12))} ${counts[t]}`);
      }
      console.log(`  ${chalk.dim('─'.repeat(20))}`);
      console.log(`  ${chalk.cyan('total:'.padEnd(12))} ${total} assets`);
      console.log(`  ${chalk.cyan('db:'.padEnd(12))} ${dbPath} (${dbSize})`);
    });
}
```

- [ ] **Step 4: Create src/cli.ts entry point**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { registerListCommand } from './cli/commands/list.js';
import { registerSearchCommand } from './cli/commands/search.js';
import { registerInfoCommand } from './cli/commands/info.js';

const program = new Command();

program
  .name('agentx')
  .description('AgentX CLI — manage your local agent asset library')
  .version('1.0.0');

registerListCommand(program);
registerSearchCommand(program);
registerInfoCommand(program);

program.parse();
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd D:\xiaoyue\mcps\agentX\agentx-mcp
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Build and smoke-test list command**

```bash
npm run build
node dist/cli.js list
```

Expected: table output (may be empty if no assets) or "No assets found."

- [ ] **Step 7: Smoke-test info command

```bash
node dist/cli.js info
```

Expected: library stats with counts and db path.

- [ ] **Step 8: Run tests to confirm nothing broken**

```bash
npm test
```

Expected: 53 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/cli.ts src/cli/commands/list.ts src/cli/commands/search.ts src/cli/commands/info.ts
git commit -m "feat: add CLI entry point with list, search, info commands"
```

---

## Phase 2: Full CLI Commands

### Task 4: get and delete commands

**Files:**
- Create: `src/cli/commands/get.ts`
- Create: `src/cli/commands/delete.ts`

- [ ] **Step 1: Create src/cli/commands/get.ts**

```typescript
import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { getAsset, readAssetContent } from '../../store/assets.js';
import { formatMeta } from '../format.js';
import chalk from 'chalk';

export function registerGetCommand(program: Command): void {
  program
    .command('get <id>')
    .description('Show asset details and content')
    .option('--no-content', 'Skip printing file content')
    .action(async (id: string, opts: { content: boolean }) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      const asset = await getAsset(id);
      if (!asset) {
        console.error(chalk.red(`Asset not found: ${id}`));
        process.exit(1);
      }

      console.log(formatMeta(asset));

      if (opts.content) {
        try {
          const content = await readAssetContent(id);
          console.log('\n' + chalk.cyan('─'.repeat(40)));
          console.log(content);
        } catch {
          console.log(chalk.yellow('\n(content file not readable)'));
        }
      }
    });
}
```

- [ ] **Step 2: Create src/cli/commands/delete.ts**

```typescript
import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { getAsset, deleteAsset } from '../../store/assets.js';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';

export function registerDeleteCommand(program: Command): void {
  program
    .command('delete <id>')
    .description('Delete an asset by ID')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes: boolean }) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      const asset = await getAsset(id);
      if (!asset) {
        console.error(chalk.red(`Asset not found: ${id}`));
        process.exit(1);
      }

      if (!opts.yes) {
        const ok = await confirm({
          message: `Delete ${asset.type} "${asset.name}"? This cannot be undone.`,
          default: false,
        });
        if (!ok) {
          console.log(chalk.dim('Cancelled.'));
          return;
        }
      }

      await deleteAsset(id);
      console.log(chalk.green(`Deleted: ${asset.name} (${id})`));
    });
}
```

- [ ] **Step 3: Register in src/cli.ts**

Add imports and register calls to `src/cli.ts`:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { registerListCommand } from './cli/commands/list.js';
import { registerSearchCommand } from './cli/commands/search.js';
import { registerInfoCommand } from './cli/commands/info.js';
import { registerGetCommand } from './cli/commands/get.js';
import { registerDeleteCommand } from './cli/commands/delete.js';

const program = new Command();

program
  .name('agentx')
  .description('AgentX CLI — manage your local agent asset library')
  .version('1.0.0');

registerListCommand(program);
registerSearchCommand(program);
registerInfoCommand(program);
registerGetCommand(program);
registerDeleteCommand(program);

program.parse();
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Build and smoke-test**

```bash
npm run build
node dist/cli.js get --help
node dist/cli.js delete --help
```

Expected: help text printed for both commands.

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: 53 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/get.ts src/cli/commands/delete.ts src/cli.ts
git commit -m "feat: add CLI get and delete commands"
```

---

### Task 5: export and import commands

**Files:**
- Create: `src/cli/commands/export.ts`
- Create: `src/cli/commands/import.ts`

- [ ] **Step 1: Create src/cli/commands/export.ts**

```typescript
import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { getAsset } from '../../store/assets.js';
import { exportAgent } from '../../export/claude.js';
import chalk from 'chalk';

export function registerExportCommand(program: Command): void {
  program
    .command('export <id>')
    .description('Export an agent as CLAUDE.md + settings.json')
    .option('-o, --output <dir>', 'Output directory', process.cwd())
    .action(async (id: string, opts: { output: string }) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      const asset = await getAsset(id);
      if (!asset) {
        console.error(chalk.red(`Asset not found: ${id}`));
        process.exit(1);
      }
      if (asset.type !== 'agent') {
        console.error(chalk.red(`Asset is not an agent (type: ${asset.type})`));
        process.exit(1);
      }

      try {
        const result = await exportAgent(id, opts.output, baseDir);
        console.log(chalk.green('Exported successfully:'));
        console.log(`  CLAUDE.md   → ${result.claudeMdPath}`);
        console.log(`  settings    → ${result.settingsPath}`);
      } catch (err) {
        console.error(chalk.red(`Export failed: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}
```

- [ ] **Step 2: Check export/claude.ts signature**

Read `src/export/claude.ts` to confirm the `exportAgent` function signature and return type. The export command above assumes:
```typescript
exportAgent(agentId: string, outputDir: string, baseDir: string): Promise<{ claudeMdPath: string; settingsPath: string }>
```

If the signature differs, adjust `src/cli/commands/export.ts` accordingly.

- [ ] **Step 3: Create src/cli/commands/import.ts**

```typescript
import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { registerImportTools } from '../../tools/import.js';
import chalk from 'chalk';
import type { AssetType } from '../../types.js';

const IMPORTABLE: AssetType[] = ['skill', 'prompt', 'rule'];

export function registerImportCommand(program: Command): void {
  program
    .command('import')
    .description('Import assets from Claude Code local directories')
    .requiredOption('-t, --type <type>', 'Asset type: skill|prompt|rule')
    .option('-s, --source <dir>', 'Override source directory')
    .option('--tags <tags>', 'Comma-separated tags to apply', 'imported,claude')
    .action(async (opts: { type: string; source?: string; tags: string }) => {
      if (!IMPORTABLE.includes(opts.type as AssetType)) {
        console.error(chalk.red(`Invalid type: ${opts.type}. Must be one of: ${IMPORTABLE.join(', ')}`));
        process.exit(1);
      }

      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      const importTools = registerImportTools(baseDir);
      const tags = opts.tags.split(',').map((t) => t.trim()).filter(Boolean);

      const result = await importTools.import_from_claude.handler({
        type: opts.type as AssetType,
        source_dir: opts.source,
        tags,
      });

      if (result.imported.length > 0) {
        console.log(chalk.green(`Imported ${result.imported.length} asset(s):`));
        for (const a of result.imported) console.log(`  + ${a.name}`);
      }
      if (result.skipped.length > 0) {
        console.log(chalk.yellow(`Skipped ${result.skipped.length} (already exist):`));
        for (const n of result.skipped) console.log(`  ~ ${n}`);
      }
      if (result.errors.length > 0) {
        console.log(chalk.red(`Errors (${result.errors.length}):`));
        for (const e of result.errors) console.log(`  ! ${e}`);
      }
    });
}
```

- [ ] **Step 4: Register in src/cli.ts**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { registerListCommand } from './cli/commands/list.js';
import { registerSearchCommand } from './cli/commands/search.js';
import { registerInfoCommand } from './cli/commands/info.js';
import { registerGetCommand } from './cli/commands/get.js';
import { registerDeleteCommand } from './cli/commands/delete.js';
import { registerExportCommand } from './cli/commands/export.js';
import { registerImportCommand } from './cli/commands/import.js';

const program = new Command();

program
  .name('agentx')
  .description('AgentX CLI — manage your local agent asset library')
  .version('1.0.0');

registerListCommand(program);
registerSearchCommand(program);
registerInfoCommand(program);
registerGetCommand(program);
registerDeleteCommand(program);
registerExportCommand(program);
registerImportCommand(program);

program.parse();
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Build and smoke-test**

```bash
npm run build
node dist/cli.js export --help
node dist/cli.js import --help
```

Expected: help text for both commands.

- [ ] **Step 7: Run tests**

```bash
npm test
```

Expected: 53 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/cli/commands/export.ts src/cli/commands/import.ts src/cli.ts
git commit -m "feat: add CLI export and import commands"
```

---

### Task 6: Interactive create command

**Files:**
- Create: `src/cli/commands/create.ts`

- [ ] **Step 1: Create src/cli/commands/create.ts**

```typescript
import type { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from '../../store/db.js';
import { createAsset } from '../../store/assets.js';
import { input, select, editor } from '@inquirer/prompts';
import chalk from 'chalk';
import type { AssetType } from '../../types.js';

const TYPES: AssetType[] = ['skill', 'prompt', 'rule', 'mcp', 'workflow', 'agent'];

export function registerCreateCommand(program: Command): void {
  program
    .command('create [type]')
    .description('Interactively create a new asset')
    .action(async (typeArg?: string) => {
      const baseDir = process.env.AGENTX_DIR ?? join(homedir(), '.agentx');
      initDb(join(baseDir, 'agentx.db'));

      let type: AssetType;
      if (typeArg && TYPES.includes(typeArg as AssetType)) {
        type = typeArg as AssetType;
      } else {
        type = await select({
          message: 'Asset type:',
          choices: TYPES.map((t) => ({ value: t, name: t })),
        });
      }

      const name = await input({
        message: 'Name:',
        validate: (v) => v.trim().length > 0 || 'Name is required',
      });

      const description = await input({ message: 'Description (optional):' });

      const tagsRaw = await input({ message: 'Tags (comma-separated, optional):' });
      const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

      const content = await editor({
        message: 'Content (opens editor):',
        default: `# ${name}\n\n`,
      });

      const meta = await createAsset(
        { type, name: name.trim(), description: description.trim() || undefined, tags },
        content,
        baseDir
      );

      console.log(chalk.green(`\nCreated ${type}: ${meta.name}`));
      console.log(chalk.dim(`ID: ${meta.id}`));
      console.log(chalk.dim(`File: ${meta.file_path}`));
    });
}
```

- [ ] **Step 2: Register in src/cli.ts**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { registerListCommand } from './cli/commands/list.js';
import { registerSearchCommand } from './cli/commands/search.js';
import { registerInfoCommand } from './cli/commands/info.js';
import { registerGetCommand } from './cli/commands/get.js';
import { registerDeleteCommand } from './cli/commands/delete.js';
import { registerExportCommand } from './cli/commands/export.js';
import { registerImportCommand } from './cli/commands/import.js';
import { registerCreateCommand } from './cli/commands/create.js';

const program = new Command();

program
  .name('agentx')
  .description('AgentX CLI — manage your local agent asset library')
  .version('1.0.0');

registerListCommand(program);
registerSearchCommand(program);
registerInfoCommand(program);
registerGetCommand(program);
registerDeleteCommand(program);
registerExportCommand(program);
registerImportCommand(program);
registerCreateCommand(program);

program.parse();
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Build and smoke-test**

```bash
npm run build
node dist/cli.js create --help
```

Expected: help text showing `[type]` argument.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: 53 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/create.ts src/cli.ts
git commit -m "feat: add interactive create command with @inquirer/prompts"
```

---

## Phase 3: ZIP Export Extension

### Task 7: Extend export_agent with zip format

**Files:**
- Modify: `src/export/claude.ts`
- Modify: `src/tools/agents.ts`

- [ ] **Step 1: Read current src/export/claude.ts**

```bash
cat src/export/claude.ts
```

Note the current `exportAgent` signature and return type before modifying.

- [ ] **Step 2: Install archiver**

```bash
npm install archiver
npm install --save-dev @types/archiver
```

- [ ] **Step 3: Add zip export to src/export/claude.ts**

Add the following function after the existing `exportAgent` function:

```typescript
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { readFile as readFileAsync } from 'fs/promises';

export async function exportAgentZip(
  agentId: string,
  outputDir: string,
  baseDir: string
): Promise<{ zipPath: string }> {
  const db = getDb();
  const agentRow = db.prepare('SELECT * FROM assets WHERE id = ? AND type = ?').get(agentId, 'agent') as
    | Record<string, unknown>
    | undefined;
  if (!agentRow) throw new Error(`Agent not found: ${agentId}`);

  const agentName = agentRow.name as string;
  const zipPath = join(outputDir, `${agentName}.agentx.zip`);

  await mkdir(outputDir, { recursive: true });

  // First generate CLAUDE.md + settings.json content in memory
  const { claudeMdContent, settingsContent } = await buildExportContent(agentId, baseDir);

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append(claudeMdContent, { name: 'CLAUDE.md' });
    archive.append(settingsContent, { name: 'settings.json' });

    archive.finalize();
  });

  return { zipPath };
}
```

Note: `buildExportContent` is a helper you extract from the existing `exportAgent` logic — it returns the string content of CLAUDE.md and settings.json without writing files. Refactor `exportAgent` to call `buildExportContent` internally so both functions share the same logic.

- [ ] **Step 4: Add format parameter to export_agent MCP tool in src/tools/agents.ts**

Find the `export_agent` tool definition and add `format` to its inputSchema and handler:

```typescript
// In the export_agent inputSchema properties, add:
format: {
  type: 'string',
  enum: ['claude', 'zip'],
  description: "Export format: 'claude' (CLAUDE.md + settings.json) or 'zip' archive",
},

// In the handler, add format routing:
handler: async ({ agent_id, output_dir, format = 'claude' }) => {
  if (format === 'zip') {
    return exportAgentZip(agent_id, output_dir ?? process.cwd(), baseDir);
  }
  return exportAgent(agent_id, output_dir ?? process.cwd(), baseDir);
},
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: 53 tests pass (zip export has no dedicated test — it's a thin wrapper).

- [ ] **Step 7: Commit**

```bash
git add src/export/claude.ts src/tools/agents.ts package.json package-lock.json
git commit -m "feat: add zip export format to export_agent tool"
```

---

## Final Verification

### Task 8: End-to-end verification and npm pack check

**Files:** None (verification only)

- [ ] **Step 1: Full build**

```bash
cd D:\xiaoyue\mcps\agentX\agentx-mcp
npm run build
```

Expected: `dist/index.js` and `dist/cli.js` both emitted, 0 errors.

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: 53 tests pass.

- [ ] **Step 3: Verify CLI help**

```bash
node dist/cli.js --help
```

Expected output includes: `list`, `search`, `info`, `get`, `delete`, `export`, `import`, `create`.

- [ ] **Step 4: Check npm pack output**

```bash
npm pack --dry-run
```

Expected: lists only `dist/` files and `README.md`, total size < 5MB.

- [ ] **Step 5: Verify shebang in dist files**

```bash
head -1 dist/index.js
head -1 dist/cli.js
```

Expected: both print `#!/usr/bin/env node`.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final verification — npm packaging + CLI companion complete"
```

---

## Self-Review

**Spec coverage check:**
- ✅ npm packaging: `bin`, `files`, `engines`, shebang — Task 1
- ✅ `agentx list [type]` — Task 3
- ✅ `agentx search <query>` — Task 3
- ✅ `agentx info` — Task 3
- ✅ `agentx get <id>` — Task 4
- ✅ `agentx delete <id>` — Task 4
- ✅ `agentx export <id>` — Task 5
- ✅ `agentx import --type <type>` — Task 5
- ✅ `agentx create <type>` (interactive) — Task 6
- ✅ ZIP export extension to `export_agent` — Task 7
- ✅ `npm pack` size check — Task 8
- ✅ CLI startup < 500ms (commander is lightweight, no startup cost added)

**Placeholder scan:** No TBDs. All code blocks are complete. Task 7 Step 3 notes a refactor needed — the instruction is explicit about what to extract.

**Type consistency:** `AssetType`, `AssetMeta`, `SearchResult` all imported from `../../types.js` consistently. `exportAgent` return type verified in Task 5 Step 2 before use. `registerImportTools` reused directly in import command — same interface as MCP tool.
