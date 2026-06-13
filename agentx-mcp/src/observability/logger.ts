/**
 * Structured JSON Logger
 *
 * Produces JSON-formatted log entries with automatic trace_id/span_id
 * correlation when OpenTelemetry tracing is active.
 *
 * Usage:
 *   import { log } from './observability/logger.js';
 *   log.info('Tool executed', { tool: 'create_skill', duration_ms: 45 });
 *   log.error('Failed', { error: err.message });
 *
 * Output format:
 *   {"timestamp":"...","level":"info","service":"agentx","message":"...","trace_id":"...","span_id":"...","attributes":{...}}
 *
 * Controlled by environment variables:
 *   AGENTX_LOG_LEVEL=info    — Threshold: debug | info | warn | error
 *   AGENTX_OTEL_SERVICE_NAME — Service name in log entries
 */

import { trace, context as otelContext } from '@opentelemetry/api';

// ---- Types ----

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  trace_id?: string;
  span_id?: string;
  attributes?: Record<string, unknown>;
}

// ---- Log level hierarchy ----

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel(): LogLevel {
  const env = process.env.AGENTX_LOG_LEVEL as LogLevel | undefined;
  if (env && env in LEVEL_RANK) return env;
  return 'info';
}

const currentLevel = getLogLevel();

// ---- Trace correlation ----

function getCurrentSpanContext(): { traceId?: string; spanId?: string } {
  try {
    const span = trace.getSpan(otelContext.active());
    if (span && span.isRecording()) {
      const ctx = span.spanContext();
      return { traceId: ctx.traceId, spanId: ctx.spanId };
    }
  } catch {
    // Tracing not initialized — no-op
  }
  return {};
}

// ---- Core log function ----

function writeLog(level: LogLevel, message: string, attrs?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[currentLevel]) return;

  const { traceId, spanId } = getCurrentSpanContext();

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.AGENTX_OTEL_SERVICE_NAME ?? 'agentx',
    message,
    ...(traceId ? { trace_id: traceId, span_id: spanId } : {}),
    ...(attrs && Object.keys(attrs).length > 0 ? { attributes: attrs } : {}),
  };

  const output = JSON.stringify(entry) + '\n';

  if (level === 'error') {
    process.stderr.write(output);
  } else {
    process.stdout.write(output);
  }
}

// ---- Public API ----

export const log = {
  debug: (message: string, attrs?: Record<string, unknown>) => writeLog('debug', message, attrs),
  info: (message: string, attrs?: Record<string, unknown>) => writeLog('info', message, attrs),
  warn: (message: string, attrs?: Record<string, unknown>) => writeLog('warn', message, attrs),
  error: (message: string, attrs?: Record<string, unknown>) => writeLog('error', message, attrs),
};
