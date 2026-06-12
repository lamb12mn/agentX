/**
 * Common types and interfaces for MCP tools
 */

/**
 * Generic handler interface for MCP tool registration
 * @template TInput - The input parameter type
 * @template TOutput - The return type
 */
export interface ToolHandler<TInput, TOutput> {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}
