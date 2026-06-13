/**
 * OpenTelemetry Tracing Module
 *
 * Provides conditional OpenTelemetry tracing for MCP tool execution.
 * Only activates when AGENTX_OTEL_ENABLED=true is set — zero overhead when disabled.
 *
 * Usage:
 *   import { initTracing, traceToolCall } from './observability/tracing.js';
 *
 *   // At startup:
 *   initTracing();
 *
 *   // Wrap tool handlers:
 *   const result = await traceToolCall('create_skill', args, () => handler(args));
 */

import { trace, Span, SpanStatusCode } from '@opentelemetry/api';
import type { Attributes } from '@opentelemetry/api';

// ---- State ----

let isInitialized = false;
let tracer: ReturnType<typeof trace.getTracer> | null = null;

// ---- Public API ----

/**
 * Initialize OpenTelemetry SDK.
 * Call once at application startup.
 * Returns `true` if tracing was enabled, `false` if not.
 *
 * Controlled by environment variables:
 *   AGENTX_OTEL_ENABLED=true    — Enable tracing
 *   AGENTX_OTEL_ENDPOINT=...    — OTLP collector URL
 *   AGENTX_OTEL_SAMPLE_RATE=1.0 — Sampling rate (0.0-1.0)
 */
export function initTracing(): boolean {
  if (isInitialized) return true;
  if (process.env.AGENTX_OTEL_ENABLED !== 'true') return false;

  isInitialized = true;
  tracer = trace.getTracer('agentx', process.env.AGENTX_OTEL_SERVICE_VERSION ?? '2.0.0');

  // Dynamic import to avoid loading OTel SDK when disabled
  const endpoint = process.env.AGENTX_OTEL_ENDPOINT ?? 'http://localhost:4318/v1/traces';
  const sampleRate = parseFloat(process.env.AGENTX_OTEL_SAMPLE_RATE ?? '1.0');

  void (async () => {
    try {
      const { NodeSDK } = await import('@opentelemetry/sdk-node');
      const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
      const { Resource } = await import('@opentelemetry/resources');
      const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import('@opentelemetry/semantic-conventions');
      const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-node');
      const { TraceIdRatioBasedSampler } = await import('@opentelemetry/sdk-trace-base');

      const exporter = new OTLPTraceExporter({ url: endpoint });

      const sdk = new NodeSDK({
        resource: new Resource({
          [ATTR_SERVICE_NAME]:
            process.env.AGENTX_OTEL_SERVICE_NAME ?? 'agentx',
          [ATTR_SERVICE_VERSION]:
            process.env.AGENTX_OTEL_SERVICE_VERSION ?? '2.0.0',
        }),
        spanProcessor: new BatchSpanProcessor(exporter, {
          maxQueueSize: 2048,
          scheduledDelayMillis: 5000,
        }),
        traceExporter: exporter,
        sampler: sampleRate < 1.0 ? new TraceIdRatioBasedSampler(sampleRate) : undefined,
      });

      sdk.start();

      process.on('SIGTERM', () => sdk.shutdown().catch(() => {}));
      process.on('SIGINT', () => sdk.shutdown().catch(() => {}));
    } catch (err) {
      console.warn('[otel] Failed to initialize OpenTelemetry SDK:', (err as Error).message);
    }
  })();

  return true;
}

/**
 * Wrap a tool handler with OpenTelemetry tracing.
 * Creates a span named `tool.<toolName>`, records success/error,
 * and propagates attributes for observability.
 *
 * When tracing is disabled, this is a no-op pass-through.
 */
export async function traceToolCall<T>(
  toolName: string,
  args: unknown,
  handler: () => Promise<T>,
): Promise<T> {
  if (!isInitialized || !tracer) {
    return handler();
  }

  const sanitizedArgs = safeStringify(args, 500);

  return tracer.startActiveSpan(
    `tool.${toolName}`,
    {
      attributes: {
        'agentx.tool.name': toolName,
        'agentx.tool.args': sanitizedArgs,
      } as Attributes,
    },
    async (span: Span) => {
      try {
        const result = await handler();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        span.setAttribute('agentx.error', true);
        if (err instanceof Error) {
          span.recordException(err);
        }
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

// ---- Helpers ----

function safeStringify(obj: unknown, maxLen: number): string {
  try {
    const s = JSON.stringify(obj);
    if (!s) return 'null';
    return s.length > maxLen ? s.substring(0, maxLen) + '...' : s;
  } catch {
    return '[unserializable]';
  }
}
