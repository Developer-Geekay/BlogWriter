import { timingSafeEqual } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { PostStore } from '@/src/db/posts';
import { SettingsStore } from '@/src/db/settings';
import { buildMcpServer } from '@/src/mcp/server';
import { loadConfig } from '@/src/config/load';
import type { Profile, Topics } from '@/src/config/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function problem(status: number, message: string, code: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

/** Constant-time compare, so a wrong token leaks neither length nor prefix. */
function tokenMatches(header: string | null, expected: string): boolean {
  const prefix = 'bearer ';
  if (!header || !header.toLowerCase().startsWith(prefix)) return false;
  const presented = Buffer.from(header.slice(prefix.length).trim());
  const want = Buffer.from(expected);
  if (presented.length !== want.length) return false;
  return timingSafeEqual(presented, want);
}

/**
 * The voice guide is optional: the portal works without config/profile.yml, and
 * a missing or malformed file should degrade to "no voice guide tool" rather
 * than taking the whole MCP endpoint down.
 */
async function voiceGuide(): Promise<{ profile?: Profile; topics?: Topics }> {
  try {
    const config = await loadConfig();
    return { profile: config.profile, topics: config.topics };
  } catch {
    return {};
  }
}

async function handle(request: Request): Promise<Response> {
  let settings;
  try {
    settings = await (await SettingsStore.open()).get();
  } catch (err) {
    // Reaching the settings document is the first thing this route does, so a
    // database outage lands here. Report it as a readable service error rather
    // than letting the framework return an opaque 500 to the MCP client.
    return problem(503, `Storage is unavailable: ${(err as Error).message}`, -32000);
  }

  // The portal toggle. Off means off — no token, however valid, gets through.
  if (!settings.mcpEnabled) {
    return problem(
      503,
      'The MCP endpoint is disabled. An administrator can enable it in the portal settings.',
      -32000,
    );
  }
  if (!settings.mcpToken) {
    return problem(503, 'The MCP endpoint has no access token configured.', -32000);
  }
  if (!tokenMatches(request.headers.get('authorization'), settings.mcpToken)) {
    return new Response(
      JSON.stringify({ error: { code: -32001, message: 'Missing or invalid bearer token.' } }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="blogwriter"',
        },
      },
    );
  }

  const { profile, topics } = await voiceGuide();
  const server = buildMcpServer({
    posts: await PostStore.open(),
    ...(profile ? { profile } : {}),
    ...(topics ? { topics } : {}),
    allowPublish: settings.mcpAllowPublish,
    ...(process.env['SITE_URL'] ? { siteUrl: process.env['SITE_URL'] } : {}),
  });

  // Stateless: a fresh server and transport per request, so concurrent external
  // portals cannot observe or disturb each other.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (err) {
    return problem(500, (err as Error).message, -32603);
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}
