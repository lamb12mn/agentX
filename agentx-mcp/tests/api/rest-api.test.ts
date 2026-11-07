import { describe, it, expect, afterEach } from 'vitest';
import { RESTAPI } from '../../src/api/rest-api.js';
import type { APIRequest } from '../../src/api/rest-api.js';
import { clearAssetCache, getAssetFromCache } from '../../src/store/cache.js';

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

  it('POST /api/workflows/execute reports not implemented', async () => {
    const api = makeApi();
    currentApi = api;
    await api.start();

    const res = await api.handleRequest(makeRequest('POST', '/api/workflows/execute'));

    expect(res.success).toBe(true);
    expect(res.data.execution.status).toBe('not_implemented');
    expect(res.data.execution.message).toBe('Execution not yet implemented');
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
