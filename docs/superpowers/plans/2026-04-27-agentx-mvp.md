# AgentX MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first MCP Server that manages Skills/MCP/prompts/rules assets and assembles them into agents, exportable as CLAUDE.md + settings.json.

**Architecture:** TypeScript MCP Server exposing ~20 tools for CRUD operations on local file assets. SQLite indexes all assets for fast search. Assets live in `~/.agentx/` as plain files (Git-friendly). Export module generates CLAUDE.md and settings.json from agent.yaml definitions.

**Tech Stack:** Node.js 20+, TypeScript, `@modelcontextprotocol/sdk`, `better-sqlite3`, `js-yaml`, `uuid`, `zod`

---

## File Structure

```
agentx-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # MCP Server entry point
│   ├── store/
│   │   ├── db.ts             # SQLite connection + schema init
│   │   ├── assets.ts         # Asset CRUD (read/write files + index)
│   │   └── agents.ts         # Agent CRUD (agent.yaml read/write)
│   ├── tools/
│   │   ├── skills.ts         # list_skills, get_skill, create_skill, update_skill, delete_skill
│   │   ├── mcps.ts           # list_mcps, get_mcp_config, toggle_mcp
│   │   ├── prompts.ts        # list_prompts, create_prompt
│   │   ├── rules.ts          # list_rules, create_rule
│   │   └── agents.ts         # list_agents, get_agent, create_agent, update_agent, delete_agent, export_agent
│   ├── export/
│   │   └── claude.ts         # Export agent → CLAUDE.md + settings.json
│   └── types.ts              # Shared TypeScript types
└── tests/
    ├── store/
    │   ├── db.test.ts
    │   └── assets.test.ts
    └── tools/
        ├── skills.test.ts
        └── agents.test.ts
```

---

### Task 1: Project Scaffold + DB Layer

**Files:**
- Create: `agentx-mcp/package.json`
- Create: `agentx-mcp/tsconfig.json`
- Create: `agentx-mcp/src/types.ts`
- Create: `agentx-mcp/src/store/db.ts`
- Create: `agentx-mcp/tests/store/db.test.ts`

- [ ] **Step 1: Initialize project**

```bash
mkdir agentx-mcp && cd agentx-mcp
npm init -y
npm install @modelcontextprotocol/sdk better-sqlite3 js-yaml uuid zod
npm install -D typescript @types/node @types/better-sqlite3 @types/js-yaml @types/uuid vitest
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create src/types.ts**

```typescript
export type AssetType = 'skill' | 'mcp' | 'prompt' | 'rule' | 'workflow' | 'agent';

export interface AssetMeta {
  id: string;
  type: AssetType;
  name: string;
  description?: string;
  tags: string[];
  file_path: string;
  created_at: number;
  updated_at: number;
}

export interface AgentConfig {
  name: string;
  version: string;
  description?: string;
  role_prompt?: string;
  rules: string[];
  skills: string[];
  mcps: Array<{ name: string; enabled: boolean }>;
  workflow?: string;
}

export interface McpConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}
```

- [ ] **Step 4: Write failing test for db.ts**

```typescript
// tests/store/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, getDb } from '../../src/store/db';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agentx-test-'));
  initDb(join(tmpDir, 'db.sqlite'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true });
});

describe('initDb', () => {
  it('creates assets table', () => {
    const db = getDb();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assets'").get();
    expect(row).toBeDefined();
  });

  it('creates agent_components table', () => {
    const db = getDb();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_components'").get();
    expect(row).toBeDefined();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

```bash
npx vitest run tests/store/db.test.ts
```
Expected: FAIL — `initDb` not found

- [ ] **Step 6: Implement src/store/db.ts**

```typescript
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let db: Database.Database;

export function initDb(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      tags TEXT DEFAULT '[]',
      file_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_components (
      agent_id TEXT NOT NULL,
      component_type TEXT NOT NULL,
      component_id TEXT NOT NULL,
      order_index INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
    CREATE INDEX IF NOT EXISTS idx_assets_name ON assets(name);
  `);
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized. Call initDb() first.');
  return db;
}
```

- [ ] **Step 7: Run test to verify it passes**

```bash
npx vitest run tests/store/db.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold project and db layer"
```

---

### Task 2: Asset Store (file + index CRUD)

**Files:**
- Create: `agentx-mcp/src/store/assets.ts`
- Create: `agentx-mcp/tests/store/assets.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/store/assets.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb } from '../../src/store/db';
import { createAsset, getAsset, listAssets, updateAsset, deleteAsset } from '../../src/store/assets';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agentx-test-'));
  initDb(join(tmpDir, 'db.sqlite'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true });
});

describe('createAsset', () => {
  it('writes file and indexes in db', () => {
    const asset = createAsset({
      type: 'skill',
      name: 'code-review',
      content: '# Code Review Skill\nReview code carefully.',
      tags: ['dev'],
      baseDir: tmpDir,
    });
    expect(asset.id).toBeTruthy();
    expect(asset.name).toBe('code-review');
    const found = getAsset(asset.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('code-review');
  });
});

describe('listAssets', () => {
  it('filters by type', () => {
    createAsset({ type: 'skill', name: 'skill-a', content: 'a', tags: [], baseDir: tmpDir });
    createAsset({ type: 'prompt', name: 'prompt-a', content: 'b', tags: [], baseDir: tmpDir });
    const skills = listAssets({ type: 'skill' });
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('skill-a');
  });

  it('filters by tag', () => {
    createAsset({ type: 'skill', name: 'tagged', content: 'x', tags: ['python'], baseDir: tmpDir });
    createAsset({ type: 'skill', name: 'untagged', content: 'y', tags: [], baseDir: tmpDir });
    const results = listAssets({ tag: 'python' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('tagged');
  });
});

describe('deleteAsset', () => {
  it('removes file and db entry', () => {
    const asset = createAsset({ type: 'rule', name: 'my-rule', content: 'rule', tags: [], baseDir: tmpDir });
    deleteAsset(asset.id);
    expect(getAsset(asset.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/store/assets.test.ts
```
Expected: FAIL — `createAsset` not found

- [ ] **Step 3: Implement src/store/assets.ts**

```typescript
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';
import type { AssetMeta, AssetType } from '../types';

interface CreateAssetInput {
  type: AssetType;
  name: string;
  content: string;
  tags: string[];
  description?: string;
  baseDir: string;
}

export function createAsset(input: CreateAssetInput): AssetMeta {
  const id = uuidv4();
  const ext = input.type === 'workflow' ? '.yaml' : '.md';
  const filePath = join(input.baseDir, `${input.type}s`, `${id}${ext}`);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, input.content, 'utf8');

  const now = Date.now();
  const meta: AssetMeta = {
    id, type: input.type, name: input.name,
    description: input.description, tags: input.tags,
    file_path: filePath, created_at: now, updated_at: now,
  };
  getDb().prepare(`
    INSERT INTO assets (id, type, name, description, tags, file_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.type, input.name, input.description ?? null,
    JSON.stringify(input.tags), filePath, now, now);
  return meta;
}

export function getAsset(id: string): AssetMeta | undefined {
  const row = getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  return { ...row, tags: JSON.parse(row.tags) };
}

export function listAssets(filter: { type?: AssetType; tag?: string } = {}): AssetMeta[] {
  let query = 'SELECT * FROM assets WHERE 1=1';
  const params: any[] = [];
  if (filter.type) { query += ' AND type = ?'; params.push(filter.type); }
  if (filter.tag) { query += " AND tags LIKE ?"; params.push(`%"${filter.tag}"%`); }
  const rows = getDb().prepare(query).all(...params) as any[];
  return rows.map(r => ({ ...r, tags: JSON.parse(r.tags) }));
}

export function updateAsset(id: string, updates: { name?: string; content?: string; tags?: string[]; description?: string }): void {
  const asset = getAsset(id);
  if (!asset) throw new Error(`Asset ${id} not found`);
  if (updates.content !== undefined) writeFileSync(asset.file_path, updates.content, 'utf8');
  const now = Date.now();
  getDb().prepare(`
    UPDATE assets SET name=COALESCE(?,name), description=COALESCE(?,description),
    tags=COALESCE(?,tags), updated_at=? WHERE id=?
  `).run(updates.name ?? null, updates.description ?? null,
    updates.tags ? JSON.stringify(updates.tags) : null, now, id);
}

export function deleteAsset(id: string): void {
  const asset = getAsset(id);
  if (!asset) return;
  try { unlinkSync(asset.file_path); } catch {}
  getDb().prepare('DELETE FROM assets WHERE id = ?').run(id);
}

export function readAssetContent(id: string): string {
  const asset = getAsset(id);
  if (!asset) throw new Error(`Asset ${id} not found`);
  return readFileSync(asset.file_path, 'utf8');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/store/assets.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: asset store with file + sqlite index"
```

---

### Task 3: MCP Server + Skills/Prompts/Rules/MCPs Tools

**Files:**
- Create: `agentx-mcp/src/index.ts`
- Create: `agentx-mcp/src/tools/skills.ts`
- Create: `agentx-mcp/src/tools/prompts.ts`
- Create: `agentx-mcp/src/tools/rules.ts`
- Create: `agentx-mcp/src/tools/mcps.ts`
- Create: `agentx-mcp/tests/tools/skills.test.ts`

- [ ] **Step 1: Write failing test for skills tools**

```typescript
// tests/tools/skills.test.ts
```typescript
// tests/tools/skills.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb } from '../../src/store/db';
import { registerSkillTools } from '../../src/tools/skills';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmpDir: string;
let tools: Record<string, (args: any) => any>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agentx-test-'));
  initDb(join(tmpDir, 'db.sqlite'));
  tools = registerSkillTools(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true });
});

describe('list_skills', () => {
  it('returns empty array when no skills', () => {
    const result = tools['list_skills']({});
    expect(result).toEqual([]);
  });
});

describe('create_skill + get_skill', () => {
  it('creates and retrieves a skill', () => {
    const created = tools['create_skill']({
      name: 'code-review',
      content: '# Code Review\nReview carefully.',
      tags: ['dev'],
    });
    expect(created.id).toBeTruthy();
    const fetched = tools['get_skill']({ id: created.id });
    expect(fetched.name).toBe('code-review');
    expect(fetched.content).toContain('Review carefully');
  });
});

describe('delete_skill', () => {
  it('removes skill from list', () => {
    const created = tools['create_skill']({ name: 'tmp', content: 'x', tags: [] });
    tools['delete_skill']({ id: created.id });
    const list = tools['list_skills']({});
    expect(list.find((s: any) => s.id === created.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/skills.test.ts
```
Expected: FAIL — `registerSkillTools` not found

- [ ] **Step 3: Implement src/tools/skills.ts**

```typescript
import { createAsset, listAssets, getAsset, updateAsset, deleteAsset, readAssetContent } from '../store/assets';

export function registerSkillTools(baseDir: string): Record<string, (args: any) => any> {
  return {
    list_skills: ({ tag }: { tag?: string }) =>
      listAssets({ type: 'skill', tag }),

    get_skill: ({ id }: { id: string }) => {
      const meta = getAsset(id);
      if (!meta) throw new Error(`Skill ${id} not found`);
      return { ...meta, content: readAssetContent(id) };
    },

    create_skill: ({ name, content, tags, description }: { name: string; content: string; tags: string[]; description?: string }) =>
      createAsset({ type: 'skill', name, content, tags, description, baseDir }),

    update_skill: ({ id, name, content, tags, description }: { id: string; name?: string; content?: string; tags?: string[]; description?: string }) => {
      updateAsset(id, { name, content, tags, description });
      return getAsset(id);
    },

    delete_skill: ({ id }: { id: string }) => {
      deleteAsset(id);
      return { success: true };
    },
  };
}
```

- [ ] **Step 4: Implement src/tools/prompts.ts**

```typescript
import { createAsset, listAssets, getAsset, updateAsset, deleteAsset, readAssetContent } from '../store/assets';

export function registerPromptTools(baseDir: string): Record<string, (args: any) => any> {
  return {
    list_prompts: ({ tag }: { tag?: string }) =>
      listAssets({ type: 'prompt', tag }),

    create_prompt: ({ name, content, tags, description }: { name: string; content: string; tags: string[]; description?: string }) =>
      createAsset({ type: 'prompt', name, content, tags, description, baseDir }),

    get_prompt: ({ id }: { id: string }) => {
      const meta = getAsset(id);
      if (!meta) throw new Error(`Prompt ${id} not found`);
      return { ...meta, content: readAssetContent(id) };
    },

    delete_prompt: ({ id }: { id: string }) => {
      deleteAsset(id);
      return { success: true };
    },
  };
}
```

- [ ] **Step 5: Implement src/tools/rules.ts**

```typescript
import { createAsset, listAssets, getAsset, deleteAsset, readAssetContent } from '../store/assets';

export function registerRuleTools(baseDir: string): Record<string, (args: any) => any> {
  return {
    list_rules: ({ tag }: { tag?: string }) =>
      listAssets({ type: 'rule', tag }),

    create_rule: ({ name, content, tags, description }: { name: string; content: string; tags: string[]; description?: string }) =>
      createAsset({ type: 'rule', name, content, tags, description, baseDir }),

    get_rule: ({ id }: { id: string }) => {
      const meta = getAsset(id);
      if (!meta) throw new Error(`Rule ${id} not found`);
      return { ...meta, content: readAssetContent(id) };
    },

    delete_rule: ({ id }: { id: string }) => {
      deleteAsset(id);
      return { success: true };
    },
  };
}
```

- [ ] **Step 6: Implement src/tools/mcps.ts**

```typescript
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { McpConfig } from '../types';

function getMcpDir(baseDir: string): string {
  const dir = join(baseDir, 'mcps');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function registerMcpTools(baseDir: string): Record<string, (args: any) => any> {
  return {
    list_mcps: () => {
      const dir = getMcpDir(baseDir);
      return readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as McpConfig);
    },

    get_mcp_config: ({ name }: { name: string }) => {
      const path = join(getMcpDir(baseDir), `${name}.json`);
      if (!existsSync(path)) throw new Error(`MCP ${name} not found`);
      return JSON.parse(readFileSync(path, 'utf8')) as McpConfig;
    },

    toggle_mcp: ({ name, enabled }: { name: string; enabled: boolean }) => {
      const path = join(getMcpDir(baseDir), `${name}.json`);
      if (!existsSync(path)) throw new Error(`MCP ${name} not found`);
      const config: McpConfig = JSON.parse(readFileSync(path, 'utf8'));
      config.enabled = enabled;
      writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
      return config;
    },

    create_mcp: ({ name, command, args, env }: { name: string; command: string; args?: string[]; env?: Record<string, string> }) => {
      const config: McpConfig = { name, command, args, env, enabled: true };
      writeFileSync(join(getMcpDir(baseDir), `${name}.json`), JSON.stringify(config, null, 2), 'utf8');
      return config;
    },
  };
}
```

- [ ] **Step 7: Run skills tests to verify they pass**

```bash
npx vitest run tests/tools/skills.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: skills/prompts/rules/mcps MCP tools"
```

---

### Task 4: Agent Tools + Export Module + MCP Server Entry

**Files:**
- Create: `agentx-mcp/src/tools/agents.ts`
- Create: `agentx-mcp/src/export/claude.ts`
- Create: `agentx-mcp/src/index.ts`
- Create: `agentx-mcp/tests/tools/agents.test.ts`

- [ ] **Step 1: Write failing tests for agent tools**

```typescript
// tests/tools/agents.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb } from '../../src/store/db';
import { registerAgentTools } from '../../src/tools/agents';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tmpDir: string;
let tools: Record<string, (args: any) => any>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agentx-test-'));
  initDb(join(tmpDir, 'db.sqlite'));
  tools = registerAgentTools(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true });
});

describe('create_agent + get_agent', () => {
  it('creates agent.yaml and retrieves it', () => {
    const agent = tools['create_agent']({
      name: 'code-assistant',
      description: 'Helps with code',
      role_prompt: '',
      rules: [],
      skills: [],
      mcps: [],
    });
    expect(agent.id).toBeTruthy();
    const fetched = tools['get_agent']({ id: agent.id });
    expect(fetched.config.name).toBe('code-assistant');
  });
});

describe('export_agent', () => {
  it('generates CLAUDE.md and settings.json', () => {
    const agent = tools['create_agent']({
      name: 'my-agent',
      description: 'Test agent',
      role_prompt: 'You are a helpful assistant.',
      rules: [],
      skills: [],
      mcps: [{ name: 'filesystem', enabled: true, command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }],
    });
    const result = tools['export_agent']({ id: agent.id, outputDir: join(tmpDir, 'export') });
    expect(existsSync(result.claude_md_path)).toBe(true);
    expect(existsSync(result.settings_json_path)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/agents.test.ts
```
Expected: FAIL — `registerAgentTools` not found

- [ ] **Step 3: Implement src/tools/agents.ts**

```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { dump, load } from 'js-yaml';
import { getDb } from '../store/db';
import { exportAgent } from '../export/claude';
import type { AgentConfig, AssetMeta } from '../types';

function getAgentDir(baseDir: string, id: string): string {
  return join(baseDir, 'agents', id);
}

export function registerAgentTools(baseDir: string): Record<string, (args: any) => any> {
  return {
    list_agents: () => {
      const rows = getDb().prepare("SELECT * FROM assets WHERE type = 'agent'").all() as any[];
      return rows.map(r => ({ ...r, tags: JSON.parse(r.tags) }));
    },

    get_agent: ({ id }: { id: string }) => {
      const row = getDb().prepare("SELECT * FROM assets WHERE id = ? AND type = 'agent'").get(id) as any;
      if (!row) throw new Error(`Agent ${id} not found`);
      const config = load(readFileSync(row.file_path, 'utf8')) as AgentConfig;
      return { ...row, tags: JSON.parse(row.tags), config };
    },

    create_agent: (input: AgentConfig & { description?: string }) => {
      const id = uuidv4();
      const dir = getAgentDir(baseDir, id);
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, 'agent.yaml');
      const config: AgentConfig = {
        name: input.name, version: '1.0.0',
        description: input.description,
        role_prompt: input.role_prompt ?? '',
        rules: input.rules ?? [],
        skills: input.skills ?? [],
        mcps: input.mcps ?? [],
      };
      writeFileSync(filePath, dump(config), 'utf8');
      const now = Date.now();
      getDb().prepare(`
        INSERT INTO assets (id, type, name, description, tags, file_path, created_at, updated_at)
        VALUES (?, 'agent', ?, ?, '[]', ?, ?, ?)
      `).run(id, input.name, input.description ?? null, filePath, now, now);
      return { id, name: input.name, file_path: filePath, config };
    },

    update_agent: ({ id, ...updates }: { id: string } & Partial<AgentConfig>) => {
      const row = getDb().prepare("SELECT * FROM assets WHERE id = ? AND type = 'agent'").get(id) as any;
      if (!row) throw new Error(`Agent ${id} not found`);
      const existing = load(readFileSync(row.file_path, 'utf8')) as AgentConfig;
      const updated = { ...existing, ...updates };
      writeFileSync(row.file_path, dump(updated), 'utf8');
      getDb().prepare('UPDATE assets SET name=?, updated_at=? WHERE id=?').run(updated.name, Date.now(), id);
      return { id, config: updated };
    },

    delete_agent: ({ id }: { id: string }) => {
      const dir = getAgentDir(baseDir, id);
      if (existsSync(dir)) rmSync(dir, { recursive: true });
      getDb().prepare('DELETE FROM assets WHERE id = ?').run(id);
      getDb().prepare('DELETE FROM agent_components WHERE agent_id = ?').run(id);
      return { success: true };
    },

    export_agent: ({ id, outputDir }: { id: string; outputDir: string }) => {
      const row = getDb().prepare("SELECT * FROM assets WHERE id = ? AND type = 'agent'").get(id) as any;
      if (!row) throw new Error(`Agent ${id} not found`);
      const config = load(readFileSync(row.file_path, 'utf8')) as AgentConfig;
      return exportAgent(config, outputDir);
    },
  };
}
```

- [ ] **Step 4: Implement src/export/claude.ts**

```typescript
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AgentConfig } from '../types';

export function exportAgent(config: AgentConfig, outputDir: string): { claude_md_path: string; settings_json_path: string } {
  mkdirSync(outputDir,`{ recursive: true }`);

  // Build CLAUDE.md content
  const lines: string[] = [];
  lines.push(`# ${config.name}`);
  if (config.description) lines.push(`\n${config.description}\n`);

  if (config.role_prompt) {
    lines.push('\n## Role\n');
    lines.push(config.role_prompt);
  }

  if (config.rules.length > 0) {
    lines.push('\n## Rules\n');
    config.rules.forEach(r => lines.push(`- ${r}`));
  }

  if (config.skills.length > 0) {
    lines.push('\n## Skills\n');
    config.skills.forEach(s => lines.push(`- ${s}`));
  }

  const claudeMdPath = join(outputDir, 'CLAUDE.md');
  writeFileSync(claudeMdPath, lines.join('\n'), 'utf8');

  // Build settings.json (MCP config)
  const mcpServers: Record<string, any> = {};
  config.mcps
    .filter(m => m.enabled)
    .forEach(m => {
      mcpServers[m.name] = {
        command: (m as any).command ?? 'npx',
        args: (m as any).args ?? [],
        env: (m as any).env ?? {},
      };
    });

  const settingsJsonPath = join(outputDir, 'settings.json');
  writeFileSync(settingsJsonPath, JSON.stringify({ mcpServers }, null, 2), 'utf8');

  return { claude_md_path: claudeMdPath, settings_json_path: settingsJsonPath };
}
```

- [ ] **Step 5: Implement src/index.ts (MCP Server entry)**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from './store/db';
import { registerSkillTools } from './tools/skills';
import { registerPromptTools } from './tools/prompts';
import { registerRuleTools } from './tools/rules';
import { registerMcpTools } from './tools/mcps';
import { registerAgentTools } from './tools/agents';

const BASE_DIR = join(homedir(), '.agentx');
const DB_PATH = join(BASE_DIR, 'db.sqlite');

initDb(DB_PATH);

const allTools = {
  ...registerSkillTools(BASE_DIR),
  ...registerPromptTools(BASE_DIR),
  ...registerRuleTools(BASE_DIR),
  ...registerMcpTools(BASE_DIR),
  ...registerAgentTools(BASE_DIR),
};

const toolSchemas = Object.keys(allTools).map(name => ({
  name,
  description: `AgentX tool: ${name}`,
  inputSchema: { type: 'object' as const, properties: {}, additionalProperties: true },
}));

const server = new Server(
  { name: 'agentx', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolSchemas }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = allTools[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  try {
    const result = tool(args ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
```

- [ ] **Step 6: Add scripts to package.json**

Edit `package.json` to add:
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "main": "dist/index.js"
}
```

- [ ] **Step 7: Run all tests**

```bash
npx vitest run
```
Expected: PASS (all tests across db, assets, skills, agents)

- [ ] **Step 8: Build and smoke test**

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```
Expected: JSON response listing all AgentX tools

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: agent tools, export module, MCP server entry"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Task 1: SQLite schema (assets + agent_components tables)
- ✅ Task 2: Asset CRUD for skills/prompts/rules (file + index)
- ✅ Task 3: list_skills, get_skill, create_skill, update_skill, delete_skill, list_prompts, create_prompt, list_rules, create_rule, list_mcps, toggle_mcp, get_mcp_config, create_mcp
- ✅ Task 4: list_agents, get_agent, create_agent, update_agent, delete_agent, export_agent → CLAUDE.md + settings.json
- ✅ MCP Server entry wiring all tools

**Type consistency check:**
- `AssetMeta.id` used consistently across all tools
- `AgentConfig` shape defined in types.ts and used in agents.ts + export/claude.ts
- `McpConfig` used in mcps.ts and referenced in AgentConfig.mcps

**Placeholder scan:** No TBDs, all steps have concrete code.
