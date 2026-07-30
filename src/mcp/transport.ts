import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer, type McpServerOptions } from './server.js';

/**
 * Serve MCP over stdio, for a client that launches this process itself
 * (Claude Desktop, Claude Code, editors).
 *
 * Stdout belongs to the protocol from here on — anything that writes progress
 * must be pointed at stderr.
 */
export async function serveStdio(options: McpServerOptions): Promise<void> {
  const server = buildMcpServer(options);
  await server.connect(new StdioServerTransport());
}

export interface HttpServeOptions extends McpServerOptions {
  port: number;
  host: string;
  /**
   * Shared secret required as `Authorization: Bearer <token>`. Without one the
   * server refuses to start on anything but a loopback address — an
   * unauthenticated MCP endpoint on a routable interface hands strangers write
   * access to the content store.
   */
  authToken?: string;
  /** Host header values to accept, as DNS-rebinding protection. */
  allowedHosts?: string[];
  onListening?: (url: string) => void;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

function unauthorized(res: ServerResponse, message: string): void {
  res
    .writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="blogwriter"',
    })
    .end(JSON.stringify({ error: { code: -32001, message } }));
}

/** Constant-time bearer comparison, so a wrong token leaks no length or prefix. */
function tokenMatches(header: string | undefined, expected: string): boolean {
  const prefix = 'bearer ';
  if (!header || !header.toLowerCase().startsWith(prefix)) return false;
  const presented = Buffer.from(header.slice(prefix.length).trim());
  const want = Buffer.from(expected);
  if (presented.length !== want.length) return false;
  return timingSafeEqual(presented, want);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += (chunk as Buffer).length;
    // A JSON-RPC call has no business being megabytes long; cap it so an
    // unauthenticated request can't buffer the process out of memory.
    if (bytes > 4 * 1024 * 1024) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  if (bytes === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Serve MCP over Streamable HTTP, for clients that connect over the network
 * rather than spawning this process — including other hosted assistants.
 *
 * Runs stateless: each request gets a fresh server and transport, so concurrent
 * clients cannot observe or disturb each other's state.
 */
export async function serveHttp(options: HttpServeOptions): Promise<() => Promise<void>> {
  const { port, host, authToken, allowedHosts, onListening, ...serverOptions } = options;

  if (!authToken && !LOOPBACK.has(host)) {
    throw new Error(
      `Refusing to listen on ${host} without an auth token. Set MCP_AUTH_TOKEN, ` +
        'or bind to 127.0.0.1 for local-only access.',
    );
  }

  const http = createServer((req, res) => {
    void (async () => {
      try {
        if (req.url?.split('?')[0] !== '/mcp') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: -32601, message: 'Not found. Use /mcp.' } }));
          return;
        }
        if (authToken && !tokenMatches(req.headers.authorization, authToken)) {
          unauthorized(res, 'Missing or invalid bearer token.');
          return;
        }

        let body: unknown;
        try {
          body = await readBody(req);
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: -32700, message: (err as Error).message } }));
          return;
        }

        // Stateless: no session IDs, one server instance per request.
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          ...(allowedHosts?.length
            ? { allowedHosts, enableDnsRebindingProtection: true }
            : {}),
        });
        const server = buildMcpServer(serverOptions);
        res.on('close', () => {
          void transport.close();
          void server.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: { code: -32603, message: (err as Error).message } }),
          );
        }
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, host, () => {
      http.removeListener('error', reject);
      onListening?.(`http://${host}:${port}/mcp`);
      resolve();
    });
  });

  return () =>
    new Promise<void>((resolve, reject) =>
      http.close((err) => (err ? reject(err) : resolve())),
    );
}
