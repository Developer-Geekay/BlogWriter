import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer, type McpServerOptions } from './server.js';

/**
 * Serve MCP over stdio, for a client that launches this process itself
 * (Claude Desktop, Claude Code, editors).
 *
 * Stdout carries the JSON-RPC framing from here on, so anything that reports
 * progress must write to stderr instead.
 *
 * Remote clients do not use this path — they connect to the portal's `/api/mcp`
 * route, which is gated by the toggle and bearer token in the settings page.
 */
export async function serveStdio(options: McpServerOptions): Promise<void> {
  const server = buildMcpServer(options);
  await server.connect(new StdioServerTransport());
}
