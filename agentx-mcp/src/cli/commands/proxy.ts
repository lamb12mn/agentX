import { Command } from 'commander';
import chalk from 'chalk';
import net from 'net';
import fs from 'fs';

export function registerProxyCommand(program: Command) {
    program
        .command('proxy')
        .description('Start MCP proxy to forward and log JSON-RPC messages')
        .option('-p, --port <port>', 'Local listening port', '3000')
        .option('-t, --target <host:port>', 'Target MCP server address', 'localhost:5000')
        .option('-l, --log <file>', 'Log file path', 'mcp-proxy.log')
        .action(async (options) => {
            const listenPort = parseInt(options.port);
            const [targetHost, targetPortStr] = options.target.split(':');
            const targetPort = parseInt(targetPortStr);
            const logFile = options.log;
            
            console.log(chalk.bold.blue('[AgentX] MCP Proxy'));
            console.log(chalk.gray(`Listen: 0.0.0.0:${listenPort} -> forward to ${targetHost}:${targetPort}`));
            console.log(chalk.gray(`Log file: ${logFile}`));
            
            const logStream = fs.createWriteStream(logFile, { flags: 'a' });
            function log(prefix: string, data: Buffer | string) {
                const timestamp = new Date().toISOString();
                const msg = typeof data === 'string' ? data : data.toString();
                const line = `[${timestamp}] ${prefix}: ${msg.trim()}`;
                logStream.write(line + '\n');
                console.log(chalk.gray(line));
            }
            
            const server = net.createServer((clientSocket) => {
                const clientAddr = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
                console.log(chalk.green(`Client connected: ${clientAddr}`));
                
                const targetSocket = net.createConnection({ host: targetHost, port: targetPort }, () => {
                    console.log(chalk.green(`Connected to target ${targetHost}:${targetPort}`));
                });
                
                clientSocket.on('data', (data) => {
                    log('CLIENT -> TARGET', data);
                    targetSocket.write(data);
                });
                
                targetSocket.on('data', (data) => {
                    log('TARGET -> CLIENT', data);
                    clientSocket.write(data);
                });
                
                clientSocket.on('error', (err) => {
                    console.log(chalk.red(`Client error: ${err.message}`));
                });
                targetSocket.on('error', (err) => {
                    console.log(chalk.red(`Target error: ${err.message}`));
                });
                
                clientSocket.on('close', () => {
                    console.log(chalk.yellow(`Client disconnected: ${clientAddr}`));
                    targetSocket.end();
                });
                targetSocket.on('close', () => {
                    console.log(chalk.yellow('Target disconnected'));
                    clientSocket.end();
                });
            });
            
            server.listen(listenPort, '0.0.0.0', () => {
                console.log(chalk.green(`MCP proxy listening on port ${listenPort}`));
                console.log(chalk.cyan('Hint: Point MCP client to http://localhost:${listenPort} to use the proxy'));
            });
            
            process.on('SIGINT', () => {
                console.log(chalk.yellow('\nShutting down proxy...'));
                server.close(() => {
                    console.log(chalk.green('Proxy closed'));
                    process.exit(0);
                });
            });
        });
}