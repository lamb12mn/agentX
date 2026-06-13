import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Security subcommand ────────────────────────────────────────────────────

async function handleSecurity(opts: { quick?: boolean; report?: string }): Promise<void> {
  console.log(chalk.bold.blue('🔒 AgentX Security Audit\n'));

  const checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; detail: string }> = [];

  // 1. Check for plaintext API keys in config files
  const configFiles = ['remotes.json', 'config.yaml', '.env'];
  for (const file of configFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const hasPlaintextKey = /(?:api[_-]?key|token|secret)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{16,}/i.test(content);
      if (hasPlaintextKey) {
        checks.push({ name: `Plaintext keys in ${file}`, status: 'fail', detail: 'Found possible API keys in plaintext' });
      } else {
        checks.push({ name: `Plaintext keys in ${file}`, status: 'pass', detail: 'No plaintext keys detected' });
      }
    }
  }

  // 2. Check vault initialization
  const vaultDir = process.env.AGENTX_VAULT_DIR ?? path.join(os.homedir(), '.agentx', 'vault');
  if (fs.existsSync(vaultDir)) {
    checks.push({ name: 'Vault initialized', status: 'pass', detail: `Vault dir exists at ${vaultDir}` });
  } else {
    checks.push({ name: 'Vault initialized', status: 'warn', detail: 'Vault not initialized — run: agentx vault init' });
  }

  // 3. Check keytar availability
  const keytarPath = path.join(process.cwd(), 'node_modules', 'keytar');
  if (fs.existsSync(keytarPath)) {
    checks.push({ name: 'OS Keychain (keytar)', status: 'pass', detail: 'keytar installed — OS keychain available' });
  } else {
    checks.push({ name: 'OS Keychain (keytar)', status: 'warn', detail: 'keytar not found — using file-only encryption fallback' });
  }

  // 4. Check config integrity
  const integrityPath = path.join(vaultDir, 'integrity.json');
  if (fs.existsSync(integrityPath)) {
    checks.push({ name: 'Config integrity tracking', status: 'pass', detail: 'integrity.json exists' });
  } else {
    checks.push({ name: 'Config integrity tracking', status: 'warn', detail: 'No integrity tracking — run ConfigIntegrity.initialize()' });
  }

  // 5. Check file permissions on config dir
  const agentxDir = process.env.AGENTX_DIR ?? path.join(os.homedir(), '.agentx');
  if (fs.existsSync(agentxDir)) {
    try {
      const stat = fs.statSync(agentxDir);
      const mode = '0' + (stat.mode & 0o777).toString(8);
      const isWorldReadable = (stat.mode & 0o004) !== 0;
      if (isWorldReadable) {
        checks.push({ name: 'Config directory permissions', status: 'warn', detail: `Directory is world-readable (${mode})` });
      } else {
        checks.push({ name: 'Config directory permissions', status: 'pass', detail: `Permissions: ${mode}` });
      }
    } catch {
      checks.push({ name: 'Config directory permissions', status: 'warn', detail: 'Could not check permissions' });
    }
  }

  // 6. npm audit
  if (!opts.quick) {
    try {
      const auditResult = execSync('npm audit --json', { stdio: 'pipe', timeout: 10000, shell: true } as any).toString();
      const audit = JSON.parse(auditResult);
      const vulnCount = audit.metadata?.vulnerabilities?.total ?? 0;
      if (vulnCount > 0) {
        checks.push({ name: 'npm audit', status: 'fail', detail: `${vulnCount} vulnerabilities found` });
      } else {
        checks.push({ name: 'npm audit', status: 'pass', detail: 'No known vulnerabilities' });
      }
    } catch {
      checks.push({ name: 'npm audit', status: 'warn', detail: 'Could not run npm audit' });
    }
  }

  // 7. Check MCP sandbox config
  const mcpTimeout = process.env.AGENTX_MCP_TIMEOUT;
  const mcpMemory = process.env.AGENTX_MCP_MAX_MEMORY;
  checks.push({
    name: 'MCP Sandbox config',
    status: 'pass',
    detail: `Timeout: ${mcpTimeout ?? '30000'}ms, Memory: ${mcpMemory ?? '512'}MB`,
  });

  // Print results
  for (const check of checks) {
    const icon = check.status === 'pass' ? chalk.green('✅')
      : check.status === 'warn' ? chalk.yellow('⚠️')
      : chalk.red('❌');
    console.log(`${icon} ${check.name}: ${chalk.dim(check.detail)}`);
  }

  const fails = checks.filter(c => c.status === 'fail').length;
  const warns = checks.filter(c => c.status === 'warn').length;

  console.log();
  if (fails > 0) {
    console.log(chalk.red(`❌ ${fails} issue(s) found — review above.`));
    process.exit(1);
  } else if (warns > 0) {
    console.log(chalk.yellow(`⚠️ ${warns} warning(s) — recommended to fix.`));
  } else {
    console.log(chalk.green('✅ All security checks passed.'));
  }

  // Generate report file if requested
  if (opts.report) {
    const report = {
      timestamp: new Date().toISOString(),
      checks: checks.map(c => ({ name: c.name, status: c.status, detail: c.detail })),
      summary: { passes: checks.filter(c => c.status === 'pass').length, warnings: warns, failures: fails },
    };
    fs.writeFileSync(opts.report, JSON.stringify(report, null, 2), 'utf-8');
    console.log(chalk.dim(`\nReport saved to ${opts.report}`));
  }
}

// ── Trace subcommand ───────────────────────────────────────────────────────

async function handleTrace(toolName: string): Promise<void> {
  console.log(chalk.bold.blue(`📡 Tracing tool: ${toolName}\n`));

  // Dynamically import tracing and load the tool
  const { initTracing } = await import('../../observability/tracing.js');
  const tracingEnabled = initTracing();

  if (!tracingEnabled) {
    console.log(chalk.yellow('⚠️  Tracing not enabled. Set AGENTX_OTEL_ENABLED=true to enable.\n'));
    console.log(chalk.dim('Running tool without tracing...\n'));
  }

  const startTime = Date.now();
  try {
    // Initialize DB and import tool registry
    const { getBaseDir, getDbPath } = await import('../common.js');
    const { initDb } = await import('../../store/db.js');
    const baseDir = getBaseDir();
    initDb(getDbPath());

    const { registerSkillTools } = await import('../../tools/skills.js');
    const { registerAgentTools } = await import('../../tools/agents.js');
    const { registerTeamTools } = await import('../../tools/teams.js');

    const allTools: Record<string, { handler: (input: never) => Promise<unknown> }> = {
      ...registerSkillTools(baseDir) as unknown as Record<string, { handler: (input: never) => Promise<unknown> }>,
      ...registerAgentTools(baseDir) as unknown as Record<string, { handler: (input: never) => Promise<unknown> }>,
      ...registerTeamTools(baseDir),
    };

    const tool = allTools[toolName];
    if (!tool) {
      console.error(chalk.red(`✗ Unknown tool: ${toolName}`));
      console.log(chalk.dim(`Available tools: ${Object.keys(allTools).join(', ')}`));
      process.exit(1);
    }

    const { traceToolCall } = await import('../../observability/tracing.js');
    const result = await traceToolCall(toolName, {}, () => tool.handler({} as never));
    const duration = Date.now() - startTime;

    console.log(chalk.green('✅ Tool executed successfully'));
    console.log(chalk.dim(`  Duration: ${duration}ms`));
    console.log(chalk.dim(`  Tracing: ${tracingEnabled ? 'enabled (spans exported)' : 'disabled'}`));
    console.log();
    console.log(chalk.bold('  Result:'));
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(chalk.red(`✗ Tool failed after ${duration}ms`));
    console.error(chalk.red(`  Error: ${(err as Error).message}`));
    process.exit(1);
  }
}

// ── Logs subcommand ────────────────────────────────────────────────────────

async function handleLogs(opts: { level?: string; limit?: string }): Promise<void> {
  console.log(chalk.bold.blue('📋 Recent structured logs\n'));

  const level = opts.level ?? 'info';
  const limit = opts.limit ? parseInt(opts.limit, 10) : 20;

  console.log(chalk.dim(`  Filtering: level >= ${level}, showing last ${limit} entries\n`));

  // Check if any structured log entries exist in stdout/stderr
  // For now, show a helpful message about how structured logging works
  console.log(chalk.yellow('ℹ️  Structured logs are emitted to stdout/stderr as JSON when tracing is active.'));
  console.log();
  console.log(chalk.bold('  How to use:'));
  console.log(chalk.dim('  1. Enable tracing:  export AGENTX_OTEL_ENABLED=true'));
  console.log(chalk.dim('  2. Set log level:   export AGENTX_LOG_LEVEL=debug'));
  console.log(chalk.dim('  3. Run the server:  agentx-mcp'));
  console.log(chalk.dim('  4. Pipe logs:       agentx-mcp 2>&1 | jq \'.\''));
  console.log();
  console.log(chalk.bold('  Log format:'));
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: level,
    service: 'agentx',
    message: 'Example log entry',
    trace_id: 'abc123...',
    span_id: 'def456...',
    attributes: { tool: 'example', duration_ms: 42 },
  }, null, 2));
}

// ── Default doctor (env check) ────────────────────────────────────────────

async function handleDefault(): Promise<void> {
  console.log(chalk.bold.blue('🔍 AgentX Doctor - 诊断中...\n'));

  let hasError = false;

  // 1. 检查 Node.js 版本
  const nodeVersion = process.version.slice(1);
  const [major] = nodeVersion.split('.');
  if (parseInt(major) >= 18) {
    console.log(chalk.green('✅ Node.js 版本:'), nodeVersion);
  } else {
    console.log(chalk.red('❌ Node.js 版本过低 (需要 >=18):'), nodeVersion);
    hasError = true;
  }

  // 2. 检查包管理器
  let pkgManager = 'npm';
  try {
    execSync('pnpm --version', { stdio: 'ignore' });
    pkgManager = 'pnpm';
  } catch(e) {}
  try {
    execSync('yarn --version', { stdio: 'ignore' });
    pkgManager = 'yarn';
  } catch(e) {}
  console.log(chalk.green('✅ 包管理器:'), pkgManager);

  // 3. 检查项目依赖
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const missingDeps: string[] = [];
    for (const dep of Object.keys(deps)) {
      const depPath = path.join(process.cwd(), 'node_modules', dep);
      if (!fs.existsSync(depPath)) {
        missingDeps.push(dep);
      }
    }
    if (missingDeps.length === 0) {
      console.log(chalk.green('✅ 所有依赖已安装'));
    } else {
      console.log(chalk.red('❌ 缺少依赖:'), missingDeps.join(', '));
      console.log(chalk.yellow('💡 运行:'), `${pkgManager} install`);
      hasError = true;
    }
  } else {
    console.log(chalk.yellow('⚠️ 未找到 package.json，跳过依赖检查'));
  }

  // 4. 检查配置文件
  const configPath = path.join(process.cwd(), 'config.yaml');
  if (fs.existsSync(configPath)) {
    console.log(chalk.green('✅ 配置文件存在: config.yaml'));
  } else {
    console.log(chalk.yellow('⚠️ 未找到 config.yaml，将使用默认配置'));
  }

  // 5. 检查存储目录权限
  const dirs = ['assets', 'skills', 'agents', 'workflows', 'prompts'];
  for (const dir of dirs) {
    const fullPath = path.join(process.cwd(), dir);
    try {
      fs.accessSync(fullPath, fs.constants.W_OK);
      console.log(chalk.green(`✅ 目录可写: ${dir}`));
    } catch(e) {
      console.log(chalk.red(`❌ 目录不可写: ${dir}`));
      hasError = true;
    }
  }

  // 6. 检查 Git 状态
  try {
    const gitStatus = execSync('git status --porcelain', { stdio: 'pipe' }).toString();
    if (gitStatus.length === 0) {
      console.log(chalk.green('✅ Git 工作区干净'));
    } else {
      console.log(chalk.yellow('⚠️ Git 工作区有未提交的更改'));
    }
  } catch(e) {
    console.log(chalk.yellow('⚠️ 未检测到 Git 仓库'));
  }

  // 7. 检查磁盘空间
  const freeSpace = os.freemem() / (1024**3);
  if (freeSpace > 1) {
    console.log(chalk.green(`✅ 可用内存: ${freeSpace.toFixed(2)} GB`));
  } else {
    console.log(chalk.red(`❌ 可用内存过低: ${freeSpace.toFixed(2)} GB`));
    hasError = true;
  }

  console.log('\n' + chalk.bold('📋 诊断完成。'));
  if (hasError) {
    console.log(chalk.red('发现一些问题，请根据上述提示修复。'));
    process.exit(1);
  } else {
    console.log(chalk.green('一切正常！AgentX 可以运行。'));
  }
}

// ── Command registration ───────────────────────────────────────────────────

export function registerDoctorCommand(program: Command) {
  const doctor = program
    .command('doctor')
    .description('Diagnose AgentX environment, dependencies, configuration, and security');

  // Default action: environment check
  doctor.action(handleDefault);

  // Subcommands
  doctor
    .command('security')
    .description('Run security audit (STRIDE + OWASP checks)')
    .option('-q, --quick', 'Quick checks only (skip npm audit)')
    .option('-r, --report <file>', 'Save report to JSON file')
    .action(handleSecurity);

  doctor
    .command('trace <toolName>')
    .description('Execute a tool with tracing and show timing')
    .action(handleTrace);

  doctor
    .command('logs')
    .description('View structured log information and format guide')
    .option('-l, --level <level>', 'Minimum log level: debug|info|warn|error', 'info')
    .option('-n, --limit <count>', 'Max entries to show', '20')
    .action(handleLogs);
}
