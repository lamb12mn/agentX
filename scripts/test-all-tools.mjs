/**
 * 全面测试 agentX 所有 MCP 工具
 * 直接导入各模块的 register 函数，构造测试输入，调用 handler
 */

import { join } from 'path';
import { homedir } from 'os';
import { mkdir } from 'fs/promises';
import { initDb, closeDb } from '../agentx-mcp/src/store/db.ts';

const BASE_DIR = join(homedir(), '.agentx-test-tools');
const DB_PATH = join(BASE_DIR, 'agentx-test.db');

// 设置环境变量，使所有工具使用相同的 baseDir
process.env.AGENTX_DIR = BASE_DIR;

// 初始化测试数据库
initDb(DB_PATH);
await mkdir(BASE_DIR, { recursive: true });

// 清理可能残留的测试数据
async function cleanupAllAssets() {
  const { listAssets, deleteAsset } = await import('../agentx-mcp/src/store/assets.ts');
  try {
    const all = await listAssets();
    for (const a of all) {
      try { await deleteAsset(a.id); } catch {}
    }
  } catch {}
}
await cleanupAllAssets();

// 导入所有工具注册函数
const { registerSkillTools } = await import('../agentx-mcp/src/tools/skills.ts');
const { registerAgentTools } = await import('../agentx-mcp/src/tools/agents.ts');
const { registerPromptTools } = await import('../agentx-mcp/src/tools/prompts.ts');
const { registerRuleTools } = await import('../agentx-mcp/src/tools/rules.ts');
const { registerMcpTools } = await import('../agentx-mcp/src/tools/mcps.ts');
const { registerSearchTools } = await import('../agentx-mcp/src/tools/search.ts');
const { registerWorkflowTools } = await import('../agentx-mcp/src/tools/workflows.ts');
const { registerImportTools } = await import('../agentx-mcp/src/tools/import.ts');
const { registerBatchTools } = await import('../agentx-mcp/src/tools/batch.ts');
const { registerCloneTools } = await import('../agentx-mcp/src/tools/clone.ts');
const { registerVersionTools } = await import('../agentx-mcp/src/tools/versions.ts');
const { registerExportTools } = await import('../agentx-mcp/src/tools/export.ts');
const { registerDependencyTools } = await import('../agentx-mcp/src/tools/dependencies.ts');

let passCount = 0;
let failCount = 0;
const results = [];

function log(toolName, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'SKIP' ? '⏭️' : '❌';
  console.log(`  ${icon} ${toolName}${detail ? ` - ${detail}` : ''}`);
  results.push({ toolName, status, detail });
  if (status === 'PASS') passCount++;
  else if (status === 'FAIL') failCount++;
}

async function callTool(handler, args = {}) {
  return await handler(args);
}

async function runTests() {
  console.log('\n========================================');
  console.log('  AgentX 全工具测试');
  console.log('========================================\n');

  // ============ Skills ============
  console.log('📦 Skills Tools:');
  const skillTools = registerSkillTools(BASE_DIR);
  let r;

  r = await callTool(skillTools.list_skills.handler);
  log('list_skills', 'PASS', `found ${Array.isArray(r) ? r.length : '?'} skills`);

  r = await callTool(skillTools.create_skill.handler, {
    name: 'test-skill',
    content: '# Test Skill\nThis is a test skill for tool testing.',
    description: 'Test skill for automated testing',
    tags: ['test', 'automated'],
  });
  const skillId = r?.id;
  log('create_skill', skillId ? 'PASS' : 'FAIL', skillId ? `id=${skillId.slice(0,8)}` : 'no id returned');

  if (skillId) {
    r = await callTool(skillTools.get_skill.handler, { id: skillId });
    log('get_skill', r && (r.meta?.name === 'test-skill' || r.name === 'test-skill' || r?.id === skillId) ? 'PASS' : 'FAIL', JSON.stringify(r).slice(0, 60));

    r = await callTool(skillTools.update_skill.handler, {
      id: skillId,
      description: 'Updated test skill description',
    });
    log('update_skill', r && (r.description === 'Updated test skill description' || r?.meta?.description === 'Updated test skill description') ? 'PASS' : 'FAIL');

    r = await callTool(skillTools.delete_skill.handler, { id: skillId });
    log('delete_skill', 'PASS');
  } else {
    log('get_skill', 'SKIP', 'no skill id');
    log('update_skill', 'SKIP', 'no skill id');
    log('delete_skill', 'SKIP', 'no skill id');
  }

  // ============ Agents ============
  console.log('\n🤖 Agents Tools:');
  const agentTools = registerAgentTools(BASE_DIR);

  r = await callTool(agentTools.list_agents.handler);
  log('list_agents', 'PASS', `found ${Array.isArray(r) ? r.length : '?'} agents`);

  r = await callTool(agentTools.create_agent.handler, {
    name: 'test-agent',
    description: 'Test agent for automated testing',
    tags: ['test'],
    config: { name: 'test-agent', version: '1.0.0', role_prompt: 'You are a test agent.', rules: [], skills: [], mcps: [] },
  });
  const agentId = r?.id;
  log('create_agent', agentId ? 'PASS' : 'FAIL', agentId ? `id=${agentId.slice(0,8)}` : 'no id');

  if (agentId) {
    r = await callTool(agentTools.get_agent.handler, { id: agentId });
    log('get_agent', r?.meta?.name === 'test-agent' ? 'PASS' : 'FAIL');

    r = await callTool(agentTools.update_agent.handler, {
      id: agentId,
      description: 'Updated test agent',
    });
    log('update_agent', r?.description === 'Updated test agent' ? 'PASS' : 'FAIL');

    r = await callTool(agentTools.export_agent.handler, { id: agentId, output_dir: join(BASE_DIR, 'exports') });
    log('export_agent', r?.claude_md_path ? 'PASS' : 'FAIL', r?.claude_md_path || 'no output');

    r = await callTool(agentTools.delete_agent.handler, { id: agentId });
    log('delete_agent', 'PASS');
  } else {
    ['get_agent','update_agent','export_agent','delete_agent'].forEach(t => log(t, 'SKIP', 'no agent id'));
  }

  // ============ Prompts ============
  console.log('\n📝 Prompts Tools:');
  const promptTools = registerPromptTools(BASE_DIR);

  r = await callTool(promptTools.list_prompts.handler);
  log('list_prompts', 'PASS', `found ${Array.isArray(r) ? r.length : '?'} prompts`);

  r = await callTool(promptTools.create_prompt.handler, {
    name: 'test-prompt',
    content: 'This is a test prompt content.',
    description: 'Test prompt',
    tags: ['test'],
  });
  const promptId = r?.id;
  log('create_prompt', promptId ? 'PASS' : 'FAIL', promptId ? `id=${promptId.slice(0,8)}` : 'no id');

  if (promptId) {
    r = await callTool(promptTools.get_prompt.handler, { id: promptId });
    log('get_prompt', r?.meta?.name === 'test-prompt' ? 'PASS' : 'FAIL');

    r = await callTool(promptTools.update_prompt.handler, {
      id: promptId,
      content: 'Updated test prompt content.',
    });
    log('update_prompt', r && r.id === promptId ? 'PASS' : 'FAIL', `id=${r?.id?.slice(0,8)}`);

    r = await callTool(promptTools.delete_prompt.handler, { id: promptId });
    log('delete_prompt', 'PASS');
  } else {
    ['get_prompt','update_prompt','delete_prompt'].forEach(t => log(t, 'SKIP', 'no prompt id'));
  }

  // ============ Rules ============
  console.log('\n📏 Rules Tools:');
  const ruleTools = registerRuleTools(BASE_DIR);

  r = await callTool(ruleTools.list_rules.handler);
  log('list_rules', 'PASS', `found ${Array.isArray(r) ? r.length : '?'} rules`);

  r = await callTool(ruleTools.create_rule.handler, {
    name: 'test-rule',
    content: '# Test Rule\nAlways test your code.',
    description: 'Test rule',
    tags: ['test'],
  });
  const ruleId = r?.id;
  log('create_rule', ruleId ? 'PASS' : 'FAIL', ruleId ? `id=${ruleId.slice(0,8)}` : 'no id');

  if (ruleId) {
    r = await callTool(ruleTools.get_rule.handler, { id: ruleId });
    log('get_rule', r?.meta?.name === 'test-rule' ? 'PASS' : 'FAIL');

    r = await callTool(ruleTools.update_rule.handler, { id: ruleId, name: 'test-rule-updated' });
    log('update_rule', r?.name === 'test-rule-updated' ? 'PASS' : 'FAIL');

    r = await callTool(ruleTools.delete_rule.handler, { id: ruleId });
    log('delete_rule', 'PASS');
  } else {
    ['get_rule','update_rule','delete_rule'].forEach(t => log(t, 'SKIP', 'no rule id'));
  }

  // ============ MCPs ============
  console.log('\n🔌 MCPs Tools:');
  const mcpTools = registerMcpTools(BASE_DIR);

  r = await callTool(mcpTools.list_mcps.handler);
  log('list_mcps', 'PASS', `found ${Array.isArray(r) ? r.length : '?'} mcps`);

  r = await callTool(mcpTools.create_mcp.handler, {
    name: 'test-mcp',
    description: 'Test MCP server',
    tags: ['test'],
    config: { name: 'test-mcp', command: 'node', args: ['server.js'], enabled: true },
  });
  const mcpId = r?.id;
  log('create_mcp', mcpId ? 'PASS' : 'FAIL', mcpId ? `id=${mcpId.slice(0,8)}` : 'no id');

  if (mcpId) {
    r = await callTool(mcpTools.get_mcp.handler, { id: mcpId });
    log('get_mcp', r?.meta?.name === 'test-mcp' ? 'PASS' : 'FAIL');

    r = await callTool(mcpTools.update_mcp.handler, { id: mcpId, description: 'Updated test MCP' });
    log('update_mcp', r?.description === 'Updated test MCP' ? 'PASS' : 'FAIL');

    r = await callTool(mcpTools.delete_mcp.handler, { id: mcpId });
    log('delete_mcp', 'PASS');
  } else {
    ['get_mcp','update_mcp','delete_mcp'].forEach(t => log(t, 'SKIP', 'no mcp id'));
  }

  // ============ Search ============
  console.log('\n🔍 Search Tools:');
  const searchTools = registerSearchTools();

  r = await callTool(searchTools.search_assets.handler, { query: 'test', limit: 10 });
  log('search_assets', Array.isArray(r) ? 'PASS' : 'FAIL', `results: ${Array.isArray(r) ? r.length : '?'}`);

  // ============ Workflows ============
  console.log('\n🔄 Workflows Tools:');
  const workflowTools = registerWorkflowTools(BASE_DIR);

  r = await callTool(workflowTools.list_workflows.handler);
  log('list_workflows', 'PASS', `found ${Array.isArray(r) ? r.length : '?'} workflows`);

  r = await callTool(workflowTools.create_workflow.handler, {
    name: 'test-workflow',
    content: 'name: test-workflow\nsteps:\n  - name: step1\n    action: echo hello',
    description: 'Test workflow',
    tags: ['test'],
  });
  const wfId = r?.id;
  log('create_workflow', wfId ? 'PASS' : 'FAIL', wfId ? `id=${wfId.slice(0,8)}` : 'no id');

  if (wfId) {
    r = await callTool(workflowTools.get_workflow.handler, { id: wfId });
    log('get_workflow', r?.meta?.name === 'test-workflow' ? 'PASS' : 'FAIL');

    r = await callTool(workflowTools.update_workflow.handler, { id: wfId, name: 'test-workflow-v2' });
    log('update_workflow', r?.name === 'test-workflow-v2' ? 'PASS' : 'FAIL');

    r = await callTool(workflowTools.delete_workflow.handler, { id: wfId });
    log('delete_workflow', 'PASS');
  } else {
    ['get_workflow','update_workflow','delete_workflow'].forEach(t => log(t, 'SKIP', 'no workflow id'));
  }

  // ============ Import ============
  console.log('\n📥 Import Tools:');
  const importTools = registerImportTools(BASE_DIR);

  r = await callTool(importTools.import_from_claude.handler, { type: 'skill' });
  log('import_from_claude', r?.imported !== undefined ? 'PASS' : 'FAIL', `imported: ${r?.imported?.length ?? 0}, errors: ${r?.errors?.length ?? 0}`);

  // ============ Batch ============
  console.log('\n🔄 Batch Tools:');
  const batchTools = registerBatchTools(BASE_DIR);

  // 先创建几个资产用于批量操作
  const batchSkill = await callTool(skillTools.create_skill.handler, {
    name: 'batch-test-1', content: 'batch test 1', tags: ['batch-test'],
  });
  const batchSkill2 = await callTool(skillTools.create_skill.handler, {
    name: 'batch-test-2', content: 'batch test 2', tags: ['batch-test'],
  });

  if (batchSkill?.id && batchSkill2?.id) {
    r = await callTool(batchTools.batch_tag_add.handler, {
      ids: [batchSkill.id, batchSkill2.id],
      tags: ['batch-added'],
    });
    log('batch_tag_add', r?.updated?.length === 2 ? 'PASS' : 'FAIL', `updated: ${r?.updated?.length ?? 0}`);

    r = await callTool(batchTools.batch_tag_remove.handler, {
      ids: [batchSkill.id, batchSkill2.id],
      tags: ['batch-added'],
    });
    log('batch_tag_remove', r?.updated?.length === 2 ? 'PASS' : 'FAIL', `updated: ${r?.updated?.length ?? 0}`);

    r = await callTool(batchTools.batch_delete.handler, {
      ids: [batchSkill.id, batchSkill2.id],
      dryRun: true,
    });
    log('batch_delete (dryRun)', r?.deleted?.length === 2 ? 'PASS' : 'FAIL', `deleted: ${r?.deleted?.length ?? 0}`);

    // 实际删除
    await callTool(batchTools.batch_delete.handler, { ids: [batchSkill.id, batchSkill2.id] });
  } else {
    ['batch_tag_add','batch_tag_remove','batch_delete'].forEach(t => log(t, 'SKIP', 'no batch assets'));
  }

  // ============ Clone ============
  console.log('\n📋 Clone Tools:');
  const cloneTools = registerCloneTools(BASE_DIR);

  const cloneSource = await callTool(skillTools.create_skill.handler, {
    name: 'clone-source-skill', content: 'original content', tags: ['clone-test'],
  });
  if (cloneSource?.id) {
    r = await callTool(cloneTools.clone_asset.handler, {
      assetId: cloneSource.id,
      newName: 'clone-target-skill',
    });
    log('clone_asset', r?.success ? 'PASS' : 'FAIL', r?.cloned?.name || 'failed');
    // 清理
    await callTool(skillTools.delete_skill.handler, { id: cloneSource.id });
    if (r?.cloned?.id) {
      await callTool(skillTools.delete_skill.handler, { id: r.cloned.id });
    }
  } else {
    log('clone_asset', 'SKIP', 'no source asset');
  }

  // ============ Versions ============
  console.log('\n📚 Versions Tools:');
  const versionTools = registerVersionTools();

  const verAsset = await callTool(skillTools.create_skill.handler, {
    name: 'version-test-skill', content: 'version test content', tags: ['version-test'],
  });
  if (verAsset?.id) {
    r = await callTool(versionTools.create_version_snapshot.handler, { assetId: verAsset.id });
    const v1 = r?.version;
    log('create_version_snapshot', v1 === 1 ? 'PASS' : 'FAIL', `version=${v1}`);

    // 修改内容再创建快照
    await callTool(skillTools.update_skill.handler, { id: verAsset.id, content: 'updated content v2' });
    r = await callTool(versionTools.create_version_snapshot.handler, { assetId: verAsset.id });
    const v2 = r?.version;
    log('create_version_snapshot v2', v2 === 2 ? 'PASS' : 'FAIL', `version=${v2}`);

    r = await callTool(versionTools.list_versions.handler, { assetId: verAsset.id });
    log('list_versions', Array.isArray(r) && r.length === 2 ? 'PASS' : 'FAIL', `count: ${Array.isArray(r) ? r.length : 0}`);

    r = await callTool(versionTools.get_version.handler, { assetId: verAsset.id, version: 1 });
    log('get_version', r?.version === 1 ? 'PASS' : 'FAIL');

    r = await callTool(versionTools.version_stats.handler, { assetId: verAsset.id });
    log('version_stats', r?.total === 2 ? 'PASS' : 'FAIL', `total=${r?.total}`);

    r = await callTool(versionTools.rollback_to_version.handler, { assetId: verAsset.id, version: 1 });
    log('rollback_to_version', r?.success ? 'PASS' : 'FAIL', r?.message || 'failed');

    r = await callTool(versionTools.clear_versions.handler, { assetId: verAsset.id });
    log('clear_versions', r?.deleted >= 0 ? 'PASS' : 'FAIL', `deleted=${r?.deleted}`);

    // 清理
    await callTool(skillTools.delete_skill.handler, { id: verAsset.id });
  } else {
    ['create_version_snapshot','list_versions','get_version','rollback_to_version','clear_versions','version_stats'].forEach(t => log(t, 'SKIP', 'no asset'));
  }

  // ============ Export ============
  console.log('\n📤 Export Tools:');
  const exportTools = registerExportTools(BASE_DIR);

  r = await callTool(exportTools.export_all.handler, { format: 'json', output: join(BASE_DIR, 'test-export.json') });
  log('export_all (json)', r?.success ? 'PASS' : 'FAIL', r?.message || r?.path || 'failed');

  r = await callTool(exportTools.export_all.handler, { format: 'yaml', output: join(BASE_DIR, 'test-export.yaml') });
  log('export_all (yaml)', r?.success ? 'PASS' : 'FAIL', r?.message || r?.path || 'failed');

  r = await callTool(exportTools.export_all.handler, { format: 'zip', output: join(BASE_DIR, 'test-export.zip') });
  log('export_all (zip)', r?.success ? 'PASS' : 'FAIL', r?.message || r?.path || 'failed');

  // ============ Dependencies ============
  console.log('\n🔗 Dependencies Tools:');
  const depTools = registerDependencyTools();

  // 创建有依赖关系的资产
  const depAgent = await callTool(agentTools.create_agent.handler, {
    name: 'dep-parent-agent',
    config: { name: 'dep-parent', version: '1.0.0', rules: [], skills: ['test-skill-dep'], mcps: [{ name: 'test-mcp-dep', command: 'node', enabled: true }] },
  });
  const depSkill = await callTool(skillTools.create_skill.handler, {
    name: 'test-skill-dep', content: 'dependency test skill',
  });
  const depMcp = await callTool(mcpTools.create_mcp.handler, {
    name: 'test-mcp-dep',
    config: { name: 'test-mcp-dep', command: 'node', args: [] },
  });

  if (depAgent?.id && depSkill?.id && depMcp?.id) {
    r = await callTool(depTools.check_dependencies.handler, { id: depAgent.id });
    log('check_dependencies', r?.safe !== undefined ? 'PASS' : 'FAIL', `safe=${r?.safe}`);

    r = await callTool(depTools.get_dependents.handler, { id: depSkill.id });
    log('get_dependents', r?.count !== undefined ? 'PASS' : 'FAIL', `count=${r?.count}`);

    r = await callTool(depTools.get_dependencies.handler, { id: depAgent.id });
    log('get_dependencies', r?.count !== undefined ? 'PASS' : 'FAIL', `count=${r?.count}`);

    r = await callTool(depTools.get_dependency_graph.handler, { id: depAgent.id });
    log('get_dependency_graph', Array.isArray(r?.graph) ? 'PASS' : 'FAIL', `total=${r?.total_dependencies}`);

    r = await callTool(depTools.detect_circular_dependency.handler, { id: depAgent.id });
    log('detect_circular_dependency', r?.has_circular_dependency !== undefined ? 'PASS' : 'FAIL', `has_cycle=${r?.has_circular_dependency}`);

    // 清理
    await callTool(agentTools.delete_agent.handler, { id: depAgent.id });
    await callTool(skillTools.delete_skill.handler, { id: depSkill.id });
    await callTool(mcpTools.delete_mcp.handler, { id: depMcp.id });
  } else {
    ['check_dependencies','get_dependents','get_dependencies','get_dependency_graph','detect_circular_dependency'].forEach(t => log(t, 'SKIP', 'no dep assets'));
  }

  // ============ Summary ============
  console.log('\n========================================');
  console.log('  Test Summary');
  console.log('========================================');
  console.log(`  ✅ Passed: ${passCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`  ⏭️  Skipped: ${results.filter(r => r.status === 'SKIP').length}`);
  console.log(`  📊 Total:   ${results.length}`);
  console.log('========================================\n');

  // 清理测试数据库
  closeDb();

  if (failCount > 0) {
    console.log('Failed tools:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.toolName}: ${r.detail}`);
    });
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  closeDb();
  process.exit(1);
});
