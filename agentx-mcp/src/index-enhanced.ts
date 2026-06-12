#!/usr/bin/env node
/**
 * Enhanced entry point — sets AGENTX_ENHANCED=true and reuses the unified index.ts.
 */
process.env.AGENTX_ENHANCED = 'true';

await import('./index.js');
