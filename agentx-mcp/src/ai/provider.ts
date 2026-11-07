/**
 * AiProvider — Abstraction layer for AI model invocation.
 *
 * Allows TeamEngine to delegate agent execution to real AI models
 * (OpenAI, Anthropic, Ollama, etc.) instead of using stub output.
 *
 * Usage:
 *   const provider = new OpenAiProvider({ apiKey: '...' });
 *   const engine = new TeamEngine({ aiProvider: provider });
 *
 * The provider is optional; if absent, TeamEngine falls back to
 * AIAssistant.executeAgent() or stub output.
 */

// ── Message types ────────────────────────────────────────────────────────────

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiExecutionOptions {
  timeout?: number;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiExecutionResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

// ── Provider interface ───────────────────────────────────────────────────────

export interface AiProvider {
  /** Execute a conversation and return the assistant's response. */
  execute(
    messages: AiMessage[],
    options?: AiExecutionOptions,
  ): Promise<AiExecutionResult>;
}

// ── Concrete adapters ────────────────────────────────────────────────────────

/** Configuration for the OpenAI-compatible provider. */
export interface OpenAiProviderConfig {
  apiKey: string;
  baseUrl?: string; // e.g. 'https://api.openai.com/v1' or custom endpoint
  defaultModel?: string;
}

/**
 * OpenAI-compatible provider (works with any OpenAI-compatible API).
 * Uses fetch() — no extra dependencies.
 */
export class OpenAiProvider implements AiProvider {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;

  constructor(config: OpenAiProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.defaultModel = config.defaultModel ?? 'gpt-4o-mini';
  }

  async execute(
    messages: AiMessage[],
    options?: AiExecutionOptions,
  ): Promise<AiExecutionResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model ?? this.defaultModel,
        messages,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
      }),
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`AI provider error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: json.choices[0]?.message?.content ?? '',
      usage: json.usage
        ? { promptTokens: json.usage.prompt_tokens, completionTokens: json.usage.completion_tokens }
        : undefined,
    };
  }
}

/**
 * No-op provider that returns a placeholder message.
 * Used as fallback when no real AI provider is configured.
 */
export class NoopProvider implements AiProvider {
  async execute(messages: AiMessage[], _options?: AiExecutionOptions): Promise<AiExecutionResult> {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    return {
      content: `[AI Simulation] Processed: ${(lastUser?.content ?? '').slice(0, 100)}...`,
    };
  }
}

/**
 * Build a real provider from environment variables when configured.
 *
 *   AGENTX_AI_API_KEY   required — without it the caller stays fully local
 *   AGENTX_AI_BASE_URL  optional — any OpenAI-compatible endpoint
 *   AGENTX_AI_MODEL     optional — default model name
 *
 * Returns `undefined` when no key is set, so existing local-only fallbacks
 * (TeamEngine's simulated stub) keep working unchanged.
 */
export function createAiProviderFromEnv(): AiProvider | undefined {
  const apiKey = process.env.AGENTX_AI_API_KEY?.trim();
  if (!apiKey) return undefined;

  return new OpenAiProvider({
    apiKey,
    baseUrl: process.env.AGENTX_AI_BASE_URL?.trim() || undefined,
    defaultModel: process.env.AGENTX_AI_MODEL?.trim() || undefined,
  });
}

/** Sentinel error for AI-only features invoked without a configured provider. */
export class AiProviderNotConfiguredError extends Error {
  constructor() {
    super('AI provider is not configured. Set AGENTX_AI_API_KEY (optionally AGENTX_AI_BASE_URL / AGENTX_AI_MODEL) to enable AI features.');
    this.name = 'AiProviderNotConfiguredError';
  }
}

/** Resolve an injected provider, or build one from the environment; throw if absent. */
export function requireAiProvider(injected?: AiProvider): AiProvider {
  const provider = injected ?? createAiProviderFromEnv();
  if (!provider) throw new AiProviderNotConfiguredError();
  return provider;
}
