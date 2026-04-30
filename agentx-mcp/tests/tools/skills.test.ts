import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../../src/store/db';
import { registerSkillTools } from '../../src/tools/skills';

describe('skill tools', () => {
  let tmpDir: string;
  let tools: ReturnType<typeof registerSkillTools>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-skills-test-'));
    initDb(join(tmpDir, 'test.db'));
    tools = registerSkillTools(tmpDir);
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('list_skills returns empty array initially', async () => {
    const result = await tools.list_skills.handler({});
    expect(result).toEqual([]);
  });

  it('create_skill creates a skill and returns metadata', async () => {
    const result = await tools.create_skill.handler({
      name: 'my-skill',
      content: '# My Skill\nDo something.',
      description: 'A test skill',
      tags: ['test'],
    });
    expect(result.name).toBe('my-skill');
    expect(result.type).toBe('skill');
    expect(result.id).toBeTruthy();
  });

  it('get_skill returns skill by id', async () => {
    const created = await tools.create_skill.handler({
      name: 'fetch-me',
      content: '# Fetch Me',
      tags: [],
    });
    const fetched = await tools.get_skill.handler({ id: created.id });
    expect(fetched).not.toBeNull();
    expect(fetched.name).toBe('fetch-me');
  });

  it('list_skills returns created skills', async () => {
    await tools.create_skill.handler({ name: 'skill-1', content: 'c1', tags: [] });
    await tools.create_skill.handler({ name: 'skill-2', content: 'c2', tags: [] });
    const list = await tools.list_skills.handler({});
    expect(list).toHaveLength(2);
  });

  it('update_skill updates name and tags', async () => {
    const created = await tools.create_skill.handler({
      name: 'old-name',
      content: 'content',
      tags: [],
    });
    const updated = await tools.update_skill.handler({
      id: created.id,
      name: 'new-name',
      tags: ['updated'],
    });
    expect(updated.name).toBe('new-name');
    expect(updated.tags).toEqual(['updated']);
  });

  it('delete_skill removes the skill', async () => {
    const created = await tools.create_skill.handler({
      name: 'to-delete',
      content: 'bye',
      tags: [],
    });
    await tools.delete_skill.handler({ id: created.id });
    const fetched = await tools.get_skill.handler({ id: created.id });
    expect(fetched).toBeNull();
  });
});
