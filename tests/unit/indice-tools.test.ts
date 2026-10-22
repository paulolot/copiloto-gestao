/**
 * T2.1 — semantic search tools through a real MCP client
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { Database } from 'sql.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../src/ponte/app.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { IndiceVault } from '../../src/ponte/vault/indice.js';
import { FakeEmbedder, makeTestDb } from './helpers.js';

const TOKEN = 't';
const raiz = mkdtempSync(join(tmpdir(), 'vault-tools-'));
let db: Database;
const servers: Server[] = [];
const clients: Client[] = [];

async function conectar(indice?: IndiceVault) {
  const server = createApp(db, TOKEN, { indice });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const client = new Client({ name: 'teste', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  }));
  servers.push(server); clients.push(client);
  return async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return { text: (r.content as { text: string }[])[0].text, isError: !!r.isError };
  };
}

beforeAll(async () => {
  mkdirSync(join(raiz, 'reunioes'), { recursive: true });
  mkdirSync(join(raiz, 'pessoas/ana'), { recursive: true });
  writeFileSync(join(raiz, 'reunioes/a.md'), '---\ntipo: reuniao\ndata: 2026-10-01\nrevisado: true\n---\n\nAdiar o deploy para sexta.\n');
  writeFileSync(join(raiz, 'pessoas/ana/pdi.md'), '---\ntipo: pdi\npessoa: "Ana Souza"\ndata: 2026-10-01\nrevisado: false\n---\n\nMentoria sigilosa de carreira.\n');
  process.env.VAULT_PATH = raiz;
  db = await makeTestDb();
});
afterAll(async () => {
  for (const c of clients) await c.close();
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
  rmSync(raiz, { recursive: true, force: true });
});

describe('semantic search tools', () => {
  it('say so when the search is not configured', async () => {
    const call = await conectar();
    const r = await call('vault_buscar_semantico', { texto: 'release' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('EMBEDDER=local');
  });

  it('search the main index, reindex on demand, and never leak the restricted area', async () => {
    const call = await conectar(await IndiceVault.abrir(new FakeEmbedder()));
    const r = await call('vault_buscar_semantico', { texto: 'release' });
    expect(r.text).toContain('reunioes/a.md');
    expect(r.text).not.toContain('pessoas/');
    expect(JSON.parse((await call('vault_reindexar', { total: true })).text)).toMatchObject({ indexadas: 2, reconstruido: true });
  });

  it('restricted search works, and the audit log keeps neither the query nor the content', async () => {
    const call = await conectar(await IndiceVault.abrir(new FakeEmbedder()));
    const r = await call('pessoa_buscar_semantico', { texto: 'promoção da Ana', pessoa: 'Ana' });
    expect(r.text).toContain('pessoas/ana/pdi.md');
    const entrada = queryAudit(db, 1)[0];
    expect(entrada.tool).toBe('pessoa_buscar_semantico');
    expect(JSON.stringify(entrada)).not.toMatch(/Ana|promo|sigilosa/);
    expect(entrada.restricted_path).toBe('pessoas/ana/pdi.md');
  });
});
