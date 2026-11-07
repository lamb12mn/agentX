import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  OpenAiProvider,
  NoopProvider,
  createAiProviderFromEnv,
  requireAiProvider,
  AiProviderNotConfiguredError,
} from '../../src/ai/provider.js';

const ENV_KEYS = ['AGENTX_AI_API_KEY', 'AGENTX_AI_BASE_URL', 'AGENTX_AI_MODEL'] as const;
const snapshot: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) snapshot[key] = process.env[key];

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe('AI provider environment wiring', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns undefined when AGENTX_AI_API_KEY is absent', () => {
    clearEnv();
    expect(createAiProviderFromEnv()).toBeUndefined();
  });

  it('builds an OpenAiProvider when the key is set', () => {
    clearEnv();
    process.env.AGENTX_AI_API_KEY = 'secret';
    expect(createAiProviderFromEnv()).toBeInstanceOf(OpenAiProvider);
  });

  it('requireAiProvider throws a named, actionable error without a key', () => {
    clearEnv();
    expect(() => requireAiProvider()).toThrow(AiProviderNotConfiguredError);
    expect(() => requireAiProvider()).toThrow(/AGENTX_AI_API_KEY/);
  });

  it('requireAiProvider prefers an explicitly injected provider', () => {
    clearEnv();
    const injected = new NoopProvider();
    expect(requireAiProvider(injected)).toBe(injected);
  });

  it('forwards baseUrl, model and execution options to the endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'rewritten answer' } }],
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiProvider({
      apiKey: 'k',
      baseUrl: 'https://example.test/v1/',
      defaultModel: 'default-model',
    });
    const result = await provider.execute(
      [{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }],
      { model: 'chosen-model', temperature: 0.2, maxTokens: 10, timeout: 1000 },
    );

    expect(result).toEqual({
      content: 'rewritten answer',
      usage: { promptTokens: 3, completionTokens: 4 },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer k');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe('chosen-model');
    expect(body.max_tokens).toBe(10);
    expect(body.temperature).toBe(0.2);
  });

  it('falls back to the default model and reports non-ok responses', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, text: async () => 'rate limited' }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiProvider({ apiKey: 'k' });
    await expect(provider.execute([{ role: 'user', content: 'q' }], {})).rejects.toThrow(/429/);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.parse(init.body as string).model).toBe('gpt-4o-mini');
  });

  it('NoopProvider returns an explicit placeholder', async () => {
    const result = await new NoopProvider().execute([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'do the task' },
    ]);
    expect(result.content).toContain('[AI Simulation]');
    expect(result.content).toContain('do the task');
  });
});
