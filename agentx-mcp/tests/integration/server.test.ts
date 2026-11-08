import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

describe('MCP Server Integration', () => {
    let serverProcess;

    beforeAll(() => {
        const projectRoot = path.resolve(__dirname, '../..');
        const distPath = path.resolve(projectRoot, 'dist/index.js');

        // Build first if dist doesn't exist
        if (!existsSync(distPath)) {
          execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
        }

        // Use the Node binary running this test suite: better-sqlite3 is a
        // native module, so spawning the PATH `node` may pick a different ABI.
        serverProcess = spawn(process.execPath, [distPath], { stdio: 'pipe' });
        // 给服务器启动时间
        return new Promise(resolve => setTimeout(resolve, 2000));
    });

    afterAll(() => {
        if (serverProcess) serverProcess.kill();
    });

    it('should start without errors', () => {
        expect(serverProcess.exitCode).toBeNull();
    });
});
