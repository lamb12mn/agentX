import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb, closeDb } from '../src/store/db.js';
import { getTemplate, getTemplatesByType, listTemplates } from '../src/templates/index.js';
import { registerPromptTools } from '../src/tools/prompts.js';

describe('built-in function prompt templates', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-templates-test-'));
    initDb(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exposes the captured system-optimize prompts as built-in templates', () => {
    const prompts = getTemplatesByType('prompt');
    const ids = prompts.map(t => t.id);

    for (const id of [
      'func-general-optimize',
      'func-output-format-optimize',
      'func-analytical-optimize',
      'func-soul-openclaw-compose',
      'func-soul-hermes-compose',
    ]) {
      expect(ids).toContain(id);
    }
    expect(listTemplates().some(t => t.id === 'func-analytical-optimize')).toBe(true);
  });

  it('preserves the source field structure and the verbatim prompt text', () => {
    const general = getTemplate('func-general-optimize');
    expect(general?.type).toBe('prompt');
    expect(general?.content).toContain('source: https://prompt.always200.com/#/basic/system');
    expect(general?.content).toContain('templateType: optimize');
    expect(general?.content).toContain('你是一个专业的AI提示词优化专家');
    expect(general?.content).toContain('{{variable_name}}');

    const analytical = getTemplate('func-analytical-optimize');
    expect(analytical?.content).toContain('contentShape: Array<{role,content}>');
    expect(analytical?.content).toContain('### system');
    expect(analytical?.content).toContain('### user');
  });

  it('creates a prompt from a built-in template through the MCP tool and reads it back', async () => {
    const tools = registerPromptTools(tmpDir);

    const meta = await tools.create_prompt.handler({
      name: 'from-builtin',
      templateId: 'func-general-optimize',
    });
    expect(meta.name).toBe('from-builtin');
    expect(meta.type).toBe('prompt');

    const loaded = await tools.get_prompt.handler({ id: meta.id });
    expect(loaded).not.toBeNull();
    expect(loaded!.content).toBe(getTemplate('func-general-optimize')!.content);
  });

  it('rejects a missing content/template and an unknown template id', async () => {
    const tools = registerPromptTools(tmpDir);
    await expect(tools.create_prompt.handler({ name: 'no-content' })).rejects.toThrow();
    await expect(
      tools.create_prompt.handler({ name: 'bad-template', templateId: 'not-a-template' }),
    ).rejects.toThrow();
  });

  it('prefers explicit content over templateId', async () => {
    const tools = registerPromptTools(tmpDir);
    const meta = await tools.create_prompt.handler({
      name: 'explicit',
      content: 'custom body',
      templateId: 'func-general-optimize',
    });
    const loaded = await tools.get_prompt.handler({ id: meta.id });
    expect(loaded!.content).toBe('custom body');
  });
});
