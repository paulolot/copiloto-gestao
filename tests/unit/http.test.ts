/**
 * T0.3 — MCP server over HTTP: auth, ping, repeated requests, tool errors in the audit log
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { Database } from 'sql.js';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../src/ponte/app.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { makeTestDb } from './helpers.js';

const TOKEN = 'token-de-teste';
let db: Database;
let server: Server;
let url: string;

beforeAll(async () => {
  db = await makeTestDb();
  server = createApp(db, TOKEN);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.VAULT_PATH = `${process.cwd()}/tests/fixtures/vault`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function connect(token = TOKEN): Promise<Client> {
  const client = new Client({ name: 'teste', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  return client;
}

describe('ponte HTTP', () => {
  it('health needs no token', async () => {
    const r = await fetch(`${url}/health`);
    expect(r.status).toBe(200);
  });

  it('returns 401 without token or with a wrong one', async () => {
    expect((await fetch(`${url}/mcp`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${url}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer errado' } })).status).toBe(401);
  });

  it('lists tools and calls ping, more than once', async () => {
    for (let n = 0; n < 3; n++) {
      const client = await connect();
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['ping', 'vault_ler', 'vault_buscar', 'vault_criar_nota', 'discord_postar']));
      const res = await client.callTool({ name: 'ping', arguments: {} });
      expect(JSON.stringify(res)).toContain('pong');
      await client.close();
    }
  });

  it('audits error calls with their params and never reads the restricted area', async () => {
    const client = await connect();
    const res = await client.callTool({ name: 'vault_ler', arguments: { caminho: 'pessoas/joao-silva.md' } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).not.toContain('sigiloso');
    const last = queryAudit(db, 1)[0];
    expect(last.tool).toBe('vault_ler');
    expect(last.result).toBe('error');
    expect(String(last.params)).toContain('pessoas/joao-silva.md');
    await client.close();
  });
});
