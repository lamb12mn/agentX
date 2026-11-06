import { describe, it, expect } from 'vitest';
import { RESTAPI } from '../../src/api/rest-api.js';
import type { APIRequest } from '../../src/api/rest-api.js';
import { clearAssetCache, getAssetFromCache } from '../../src/store/cache.js';

function makeRequest(method: string, path: string): APIRequest {
  return { method, path, query: {}, body: {}, headers: {} };
}

function makeApi(): RESTAPI {
  return new RESTAPI({
    port: 3000,
    host: 'localhost',
    cors: true,
    rateLimit: { windowMs: 60_000, max: 100 },
  });
}

describe('REST API default routes', () => {
  it('GET /api/cache/stats returns live cache statistics', async () => {
    clearAssetCache();
    getAssetFromCache('missing-asset');

    const api = makeApi();
    await api.start();

    const res = await api.handleRequest(makeRequest('GET', '/api/cache/stats'));

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ hits: 0, misses: 1, hitRate: 0 });
    expect(res.data).toHaveProperty('assetCacheSize');
    expect(res.data).toHaveProperty('paginatedCacheSize');
  });

  it('POST /api/workflows/execute reports not implemented', async () => {
    const api = makeApi();
    await api.start();

    const res = await api.handleRequest(makeRequest('POST', '/api/workflows/execute'));

    expect(res.success).toBe(true);
    expect(res.data.execution.status).toBe('not_implemented');
    expect(res.data.execution.message).toBe('Execution not yet implemented');
  });
});
