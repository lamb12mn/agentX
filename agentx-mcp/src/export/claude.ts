import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { AgentConfig } from '../types.js';

/** 将 Agent 配置导出为 CLAUDE.md + settings.json 格式 */
export async function exportAgent(
  config: AgentConfig,
  outputDir: string
): Promise<{ claude_md_path: string; settings_json_path: string }> {
  await mkdir(outputDir, { recursive: true });

  const claudeMdPath = join(outputDir, 'CLAUDE.md');
  const settingsJsonPath = join(outputDir, 'settings.json');

  // Build CLAUDE.md content
  const lines: string[] = [];
  lines.push(`# ${config.name}`);
  lines.push('');
  if (config.description) {
    lines.push(config.description);
    lines.push('');
  }
  if (config.role_prompt) {
    lines.push('## Role');
    lines.push('');
    lines.push(config.role_prompt);
    lines.push('');
  }
  if (config.rules.length > 0) {
    lines.push('## Rules');
    lines.push('');
    for (const rule of config.rules) {
      lines.push(`- ${rule}`);
    }
    lines.push('');
  }
  if (config.skills.length > 0) {
    lines.push('## Skills');
    lines.push('');
    for (const skill of config.skills) {
      lines.push(`- ${skill}`);
    }
    lines.push('');
  }

  await writeFile(claudeMdPath, lines.join('\n'), 'utf-8');

  // Build settings.json — enabled MCPs only
  const mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {};
  for (const mcp of config.mcps) {
    if (mcp.enabled) {
      const entry: { command: string; args?: string[]; env?: Record<string, string> } = {
        command: mcp.command,
      };
      if (mcp.args !== undefined) entry.args = mcp.args;
      if (mcp.env !== undefined) entry.env = mcp.env;
      mcpServers[mcp.name] = entry;
    }
  }

  await writeFile(settingsJsonPath, JSON.stringify({ mcpServers }, null, 2), 'utf-8');

  return { claude_md_path: claudeMdPath, settings_json_path: settingsJsonPath };
}
