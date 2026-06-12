import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'child_process';
import readline from 'readline';

export function registerMcpInspect(program: Command) {
    program
        .command('mcp inspect')
        .description('Start interactive REPL to explore an MCP server')
        .option('-s, --server <command>', 'Server command to run', 'npx -y @modelcontextprotocol/server-filesystem')
        .action(async (options) => {
            const serverCommand = options.server.split(' ');
            const serverProcess = spawn(serverCommand[0], serverCommand.slice(1), { stdio: ['pipe', 'pipe', 'inherit'] });
            
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: chalk.cyan('mcp> ')
            });
            
            let buffer = '';
            serverProcess.stdout.on('data', (data) => {
                buffer += data.toString();
                // 尝试解析完整的 JSON 响应（假设每行一个 JSON）
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const json = JSON.parse(line);
                            console.log(chalk.green('\n← '), JSON.stringify(json, null, 2));
                        } catch(e) {
                            console.log(chalk.yellow('\n← (raw)'), line);
                        }
                        rl.prompt();
                    }
                }
            });
            
            rl.prompt();
            rl.on('line', (input) => {
                if (input.trim() === 'exit') {
                    serverProcess.kill();
                    rl.close();
                    return;
                }
                // 尝试解析为 JSON，否则当作方法名 (如 "tools/list")
                let message;
                if (input.trim().startsWith('{')) {
                    try {
                        message = JSON.parse(input);
                    } catch(e) {
                        console.error(chalk.red('Invalid JSON.'));
                        rl.prompt();
                        return;
                    }
                } else {
                    // 转换为 initialize 或 tools/list 格式
                    const parts = input.trim().split(' ');
                    const method = parts[0];
                    const params = parts.slice(1).join(' ') || '{}';
                    let paramsObj;
                    try {
                        paramsObj = JSON.parse(params);
                    } catch(e) {
                        paramsObj = {};
                    }
                    message = {
                        jsonrpc: '2.0',
                        id: Date.now(),
                        method: method,
                        params: paramsObj
                    };
                }
                serverProcess.stdin.write(JSON.stringify(message) + '\n');
                rl.prompt();
            });
            
            rl.on('close', () => {
                serverProcess.kill();
                console.log(chalk.gray('\nInspect session ended.'));
            });
            
            serverProcess.on('error', (err) => {
                console.error(chalk.red('Server error:'), err.message);
                rl.close();
            });
        });
}