import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';

describe('MCP Server Integration', () => {
    let serverProcess;

    beforeAll(() => {
        const serverPath = path.resolve(__dirname, '../../dist/index.js');
        serverProcess = spawn('node', [serverPath]);
        // 给服务器启动时间（不检查输出）
        return new Promise(resolve => setTimeout(resolve, 2000));
    });

    afterAll(() => {
        if (serverProcess) serverProcess.kill();
    });

    it('should start without errors', () => {
        expect(serverProcess.exitCode).toBeNull();
    });
});
