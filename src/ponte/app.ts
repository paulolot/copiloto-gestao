/**
 * T0.3 — HTTP server (Streamable HTTP transport)
 * Authentication: Bearer token in Authorization header, compared in constant time.
 * Stateless: each request gets its own McpServer + transport (a connected McpServer cannot be reused).
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { createHash, timingSafeEqual } from 'crypto';
import type { Database } from 'sql.js';
import { createMcpServer } from './mcp.js';

/** Constant-time comparison; hashing first makes the length irrelevant too. */
export function safeCompare(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * The token may come in the Authorization header or as the last URL segment (/mcp/<token>).
 * The URL form exists for clients that cannot set headers (the Grok Bot connector only takes a URL).
 */
function authenticate(req: IncomingMessage, urlToken: string | undefined, token: string): boolean {
  if (!token) return false; // token must be configured
  const auth = req.headers['authorization'] ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return safeCompare(bearer, token) || (urlToken !== undefined && safeCompare(urlToken, token));
}

/** Splits `/mcp` and `/mcp/<token>`; returns null for any other path. */
function parseMcpPath(path: string): { urlToken?: string } | null {
  if (path === '/mcp') return {};
  const m = /^\/mcp\/([^/]+)$/.exec(path);
  if (!m) return null;
  try {
    return { urlToken: decodeURIComponent(m[1]) };
  } catch {
    return { urlToken: '' };
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createApp(db: Database, token: string, deps: Parameters<typeof createMcpServer>[1] = {}): Server {
  return createServer(async (req, res) => {
    try {
      const path = (req.url ?? '').split('?')[0];

      // Health check (no auth required)
      if (path === '/health' && req.method === 'GET') {
        sendJson(res, 200, { status: 'ok', ts: new Date().toISOString() });
        return;
      }

      const mcpPath = parseMcpPath(path);
      if (!authenticate(req, mcpPath?.urlToken, token)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      if (!mcpPath) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }

      const mcp = createMcpServer(db, deps);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
        void mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      console.error('Erro ao tratar requisição:', (e as Error).message);
      sendJson(res, 500, { error: 'Internal error' });
    }
  });
}
