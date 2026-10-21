/**
 * T1.5 — Board tools through a real MCP client
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { Database } from 'sql.js';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../src/ponte/app.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

const TOKEN = 'token-de-teste';
let db: Database;
let server: Server;
let client: Client;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: (r.content as { text: string }[])[0].text, isError: !!r.isError };
};

beforeAll(async () => {
  db = await makeTestDb();
  server = createApp(db, TOKEN, { azdo: new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() }) });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  client = new Client({ name: 'teste', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
});

afterAll(async () => {
  await client.close();
  await new Promise<void>((r) => server.close(() => r()));
});

describe('ferramentas de boards', () => {
  it('lists the board tools', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['boards_sincronizar', 'boards_saude', 'boards_alertas', 'boards_itens_problema', 'metricas_time']));
  });

  it('refuses to answer before the first sync', async () => {
    const r = await call('boards_saude', { time: 'fiscal' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('boards_sincronizar');
  });

  it('syncs, then answers health, alerts, problem items and metrics, always with the source', async () => {
    const sync = await call('boards_sincronizar', { time: 'fiscal' });
    expect(JSON.parse(sync.text)[0].workItems).toBe(7);

    const saude = JSON.parse((await call('boards_saude')).text)[0];
    expect(saude.fonte).toMatchObject({ sistema: 'Azure DevOps', areaPath: 'Metanet\\Squad Fiscal' });
    expect(saude.metricas.bloqueados).toBe(1);

    const alertas = JSON.parse((await call('boards_alertas', { time: 'fiscal' })).text)[0];
    expect(alertas.sinais.map((s: { chave: string }) => s.chave)).toContain('bloqueio');
    expect(alertas.sinais[0].desde).toBeTruthy();

    const itens = JSON.parse((await call('boards_itens_problema', { time: 'fiscal', tipo: 'bloqueados' })).text);
    expect(itens.itens.map((i: { id: number }) => i.id)).toEqual([2]);

    const hist = JSON.parse((await call('metricas_time', { time: 'fiscal', periodo: 'historico' })).text);
    expect(Object.keys(hist.historico).length).toBeGreaterThan(0);
  });

  it('never returns people', async () => {
    const todos = [(await call('boards_saude')).text, (await call('boards_itens_problema', { time: 'fiscal', tipo: 'sem_dono' })).text].join();
    expect(todos).not.toContain('ana@empresa.com');
  });

  it('rejects an unknown team and records every call in the audit log', async () => {
    const r = await call('metricas_time', { time: 'marte' });
    expect(r.isError).toBe(true);
    const tools = queryAudit(db).map((a) => a.tool);
    expect(tools).toEqual(expect.arrayContaining(['boards_sincronizar', 'boards_saude', 'metricas_time']));
    expect(queryAudit(db).some((a) => a.tool === 'metricas_time' && a.result === 'error')).toBe(true);
  });
});
