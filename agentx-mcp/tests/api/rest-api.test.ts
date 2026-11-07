import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RESTAPI } from '../../src/api/rest-api.js';
import type { APIRequest } from '../../src/api/rest-api.js';
import { clearAssetCache, getAssetFromCache } from '../../src/store/cache.js';
import { initDb, closeDb } from '../../src/store/db.js';
import { createAsset } from '../../src/store/assets.js';

function makeRequest(method: string, path: string, headers: Record<string, string> = {}): APIRequest {
  return { method, path, query: {}, body: {}, headers };
}

function makeApi(): RESTAPI {
  return new RESTAPI({
    port: 0, // ephemeral port — start() now binds a real HTTP server
    host: '127.0.0.1',
    cors: true,
    rateLimit: { windowMs: 60_000, max: 100 },
  });
}

let currentApi: RESTAPI | undefined;

afterEach(async () => {
  if (currentApi) {
    await currentApi.stop();
    currentApi = undefined;
  }
});

describe('REST API default routes', () => {
  it('GET /api/cache/stats returns live cache statistics', async () => {
    clearAssetCache();
    getAssetFromCache('missing-asset');

    const api = makeApi();
    currentApi = api;
    await api.start();

    const res = await api.handleRequest(makeRequest('GET', '/api/cache/stats'));

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ hits: 0, misses: 1, hitRate: 0 });
    expect(res.data).toHaveProperty('assetCacheSize');
    expect(res.data).toHaveProperty('paginatedCacheSize');
  });

  it('POST /api/workflows/execute validates its input', async () => {
    const api = makeApi();
    currentApi = api;
    await api.start();

    const missing = await api.handleRequest(makeRequest('POST', '/api/workflows/execute'));
    expect(missing.success).toBe(false);
    expect(missing.message).toContain('workflowId');

    const badInput: APIRequest = {
      ...makeRequest('POST', '/api/workflows/execute'),
      body: { workflowId: 'x', input: 'not-an-object' },
    };
    const invalid = await api.handleRequest(badInput);
    expect(invalid.success).toBe(false);
    expect(invalid.message).toContain('input');
  });

  it('start() binds a real HTTP socket and stop() releases it', async () => {
    const api = makeApi();
    currentApi = api;
    await api.start();

    // port 0 → OS assigns an ephemeral port that must be reachable
    const addr = (api as unknown as { server: { address(): { port: number } } | null }).server;
    const port = addr!.address().port;
    expect(port).toBeGreaterThan(0);

    const resp = await fetch(`http://127.0.0.1:${port}/health`);
    expect(resp.status).toBe(200);
    const json = (await resp.json()) as { success: boolean; data: { status: string } };
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ok');
  });
});

describe('REST API workflow execution', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentx-rest-workflow-test-'));
    initDb(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDb();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/workflows/execute runs a stored workflow and returns the full result', async () => {
    const asset = await createAsset(
      { type: 'workflow', name: 'wf', tags: [] },
      'steps:\n  - from: start\n    to: writer\n',
      tmpDir,
    );

    const api = makeApi();
    currentApi = api;
    await api.start();

    const req: APIRequest = {
      ...makeRequest('POST', '/api/workflows/execute'),
      body: { workflowId: asset.id, input: { topic: 'SQLite' } },
    };
    const res = await api.handleRequest(req);

    expect(res.success).toBe(true);
    expect(res.data.execution.status).toBe('completed');
    expect(res.data.execution.simulated).toBe(true);
    expect(res.data.execution.steps).toHaveLength(1);
    expect(res.data.execution.aggregatedOutput).toMatchObject({ topic: 'SQLite' });
    expect(res.data.execution.sessionId).toBeTruthy();
  });
});

describe('REST API authentication', () => {
  it('rejects requests without credentials (401, not thrown)', async () => {
    const api = new RESTAPI({ port: 0, host: '127.0.0.1', cors: true, apiKey: 'secret-key' });
    currentApi = api;
    await api.start();
    api.registerRoute('GET', '/api/ping', () => ({ pong: true }));

    const res = await api.handleRequest(makeRequest('GET', '/api/ping'));
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.error).toBe('Unauthorized');
  });

  it('accepts X-API-Key and Bearer token, and keeps /health public', async () => {
    const api = new RESTAPI({ port: 0, host: '127.0.0.1', cors: true, apiKey: 'secret-key' });
    currentApi = api;
    await api.start();
    api.registerRoute('GET', '/api/ping', () => ({ pong: true }));

    const viaHeader = await api.handleRequest(makeRequest('GET', '/api/ping', { 'x-api-key': 'secret-key' }));
    expect(viaHeader.success).toBe(true);

    const viaBearer = await api.handleRequest(makeRequest('GET', '/api/ping', { authorization: 'Bearer secret-key' }));
    expect(viaBearer.success).toBe(true);

    const wrong = await api.handleRequest(makeRequest('GET', '/api/ping', { 'x-api-key': 'wrong-key' }));
    expect(wrong.success).toBe(false);

    const health = await api.handleRequest(makeRequest('GET', '/health'));
    expect(health.success).toBe(true);
  });
});
