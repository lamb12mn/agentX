import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'child_process';
import fs from 'fs';

export function registerMcpSend(program: Command) {
    program
        .command('mcp send')
        .description('Send a JSON-RPC message to an MCP server and print response')
        .option('-s, --server <command>', 'Server command to run (e.g. "node server.js")', 'npx -y @modelcontextprotocol/server-filesystem')
        .option('-m, --message <json>', 'JSON-RPC message as string')
        .option('-f, --file <path>', 'File containing JSON-RPC message')
        .option('-t, --timeout <ms>', 'Timeout in milliseconds', '10000')
        .action(async (options) => {
            const messageStr = options.message || (options.file ? fs.readFileSync(options.file, 'utf8') : null);
            if (!messageStr) {
                console.error(chalk.red('Either --message or --file is required.'));
                process.exit(1);
            }
            let message;
            try {
                message = JSON.parse(messageStr);
            } catch (e) {
                console.error(chalk.red('Invalid JSON:'), e.message);
                process.exit(1);
            }
            
            const timeout = parseInt(options.timeout);
            const serverCommand = options.server.split(' ');
            const serverProcess = spawn(serverCommand[0], serverCommand.slice(1), { stdio: ['pipe', 'pipe', 'inherit'] });
            
            let responseData = '';
            serverProcess.stdout.on('data', (data) => {
                responseData += data.toString();
            });
            
            // 发送消息
            serverProcess.stdin.write(JSON.stringify(message) + '\n');
            serverProcess.stdin.end();
            
            // 设置超时
            const timer = setTimeout(() => {
                serverProcess.kill();
                console.error(chalk.red('Request timed out.'));
                process.exit(1);
            }, timeout);
            
            serverProcess.on('close', (code) => {
                clearTimeout(timer);
                if (code !== 0) {
                    console.error(chalk.red(`Server exited with code ${code}`));
                    process.exit(1);
                }
                try {
                    const response = JSON.parse(responseData);
                    console.log(JSON.stringify(response, null, 2));
                } catch (e) {
                    console.error(chalk.red('Failed to parse response:'), responseData);
                    process.exit(1);
                }
            });
        });
}