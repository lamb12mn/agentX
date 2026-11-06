/**
 * Diagnostic output for the MCP server process.
 *
 * `StdioServerTransport` owns stdout as the JSON-RPC channel, so human-readable
 * diagnostics must go to stderr or the client will receive non-JSON lines.
 * CLI commands may keep using console.log — this helper is for everything that
 * can run inside the server.
 */
export function diag(message: string): void {
  process.stderr.write(message + '\n');
}
