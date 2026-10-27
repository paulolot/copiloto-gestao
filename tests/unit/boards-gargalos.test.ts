/**
 * boards_gargalos — time in each board column, in business days
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { Database } from 'sql.js';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../src/ponte/app.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { diasUteisSp, gargalosDoTime } from '../../src/ponte/azure/gargalos.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

const TOKEN = 'token-de-teste';
// Wednesday 2026-10-21 12:00 in São Paulo
const AGORA_SP = new Date('2026-10-21T15:00:00Z');

describe('diasUteisSp', () => {
  it('counts weekdays after the entry day, in São Paulo time', () => {
    expect(diasUteisSp(new Date('2026-10-21T15:00:00Z'), AGORA_SP)).toBe(0);
    expect(diasUteisSp(new Date('2026-10-20T15:00:00Z'), AGORA_SP)).toBe(1);
    expect(diasUteisSp(new Date('2026-10-16T15:00:00Z'), AGORA_SP)).toBe(3); // Fri -> Wed: Mon, Tue, Wed
    expect(diasUteisSp(new Date('2026-10-10T15:00:00Z'), AGORA_SP)).toBe(8); // Sat
    // 22:00 in São Paulo on Oct 20 is already Oct 21 in UTC: still counts as Oct 20
    expect(diasUteisSp(new Date('2026-10-21T01:00:00Z'), AGORA_SP)).toBe(1);
  });
});

describe('gargalosDoTime', () => {
  let db: Database;
  const ins = (id: number, o: Record<string, unknown>) => {
    const r = { tipo: 'User Story', estado: 'Active', coluna: 'Dev implementando', dono: null, dono_nome: null, coluna_desde: null, mudanca: null, ...o };
    db.run(
      `INSERT INTO work_items (id, time_id, tipo, estado, titulo, criado_em, alterado_em, mudanca_estado_em, coluna, dono, dono_nome, coluna_desde)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, 'fiscal', r.tipo, r.estado, `Item ${id}`, '2026-09-01T12:00:00Z', '2026-10-20T12:00:00Z', r.mudanca, r.coluna, r.dono, r.dono_nome, r.coluna_desde],
    );
  };

  beforeAll(async () => {
    db = await makeTestDb();
    ins(1, { coluna_desde: '2026-10-09T15:00:00Z', dono: 'ana@x.com', dono_nome: 'Ana' }); // Fri 9/10 -> 8 business days
    ins(2, { coluna_desde: '2026-10-20T15:00:00Z' }); // 1
    ins(3, { coluna_desde: '2026-10-16T15:00:00Z', tipo: 'Bug' }); // 3 (not above limit 3)
    ins(4, { coluna: 'Diponível Revisão de Código', coluna_desde: '2026-10-14T15:00:00Z' }); // 5, unmapped
    ins(5, { coluna: 'Testando', mudanca: '2026-10-19T15:00:00Z' }); // no column date: state change, 2
    ins(6, { coluna: 'Testando' }); // neither: last change (alterado_em 10/20), 1
    ins(7, { estado: 'Closed', coluna: 'Concluído', coluna_desde: '2026-10-01T15:00:00Z' }); // final
    ins(8, { estado: 'New', coluna: 'Backlog', coluna_desde: '2026-09-01T15:00:00Z' }); // backlog
    ins(9, { estado: 'New', coluna: 'Ideias', coluna_desde: '2026-09-01T15:00:00Z' }); // backlog
    ins(10, { tipo: 'Test Case', coluna_desde: '2026-09-01T15:00:00Z' }); // type out
    ins(11, { tipo: 'Task', coluna_desde: '2026-10-19T15:00:00Z' }); // 2
  });

  it('builds the columns in board order with the numbers and the unmapped column flagged', () => {
    const r = gargalosDoTime(db, 'fiscal', { agora: AGORA_SP });
    expect(r.colunas.map((c) => c.coluna)).toEqual(['Dev implementando', 'Testando', 'Diponível Revisão de Código']);
    const dev = r.colunas[0];
    expect(dev).toMatchObject({ itens: 4, itens_acima_do_limite: 1, maior_tempo_dias_uteis: 8, mediana_dias_uteis: 2.5, media_dias_uteis: 3.5 });
    expect(dev.itens_mais_antigos.map((i) => [i.id, i.dias_uteis_na_coluna])).toEqual([[1, 8], [3, 3], [11, 2], [2, 1]]);
    expect(dev.itens_mais_antigos[0]).toMatchObject({ responsavel: 'Ana', tipo: 'User Story', data_origem: 'mudanca_de_coluna' });
    expect(dev.itens_mais_antigos[1].responsavel).toBe('sem responsável');
    expect(dev).not.toHaveProperty('coluna_nao_mapeada');
    expect(r.colunas[2]).toMatchObject({ coluna_nao_mapeada: true, itens: 1, itens_acima_do_limite: 1 });
    const teste = r.colunas[1];
    expect(teste.itens_mais_antigos.map((i) => [i.id, i.dias_uteis_na_coluna, i.data_origem])).toEqual([[5, 2, 'mudanca_de_estado'], [6, 1, 'ultima_alteracao']]);
    expect(r.itens_sem_data_de_coluna).toBe(2);
  });

  it('ranks columns by items above the limit, then by longest time, and honors limit, top, tipos and backlog', () => {
    const r = gargalosDoTime(db, 'fiscal', { agora: AGORA_SP });
    expect(r.ranking_colunas.map((c) => c.coluna)).toEqual(['Dev implementando', 'Diponível Revisão de Código', 'Testando']);
    const so = gargalosDoTime(db, 'fiscal', { agora: AGORA_SP, limiteDiasUteis: 1, top: 1, tipos: ['Bug'], incluirBacklog: true });
    expect(so.colunas.map((c) => [c.coluna, c.itens])).toEqual([['Dev implementando', 1]]);
    expect(so.colunas[0].itens_mais_antigos).toHaveLength(1);
    const todos = gargalosDoTime(db, 'fiscal', { agora: AGORA_SP, tipos: ['User Story'], incluirBacklog: true });
    expect(todos.colunas.map((c) => c.coluna)).toEqual(expect.arrayContaining(['Ideias', 'Backlog']));
    expect(todos.colunas.map((c) => c.coluna)).not.toContain('Concluído');
  });
});

describe('boards_gargalos via MCP', () => {
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
    client = new Client({ name: 'teste', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
  });
  afterAll(async () => {
    await client.close();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('is listed, needs a sync first, and answers for "Squad Fiscal" with limit 3', async () => {
    expect((await client.listTools()).tools.map((t) => t.name)).toContain('boards_gargalos');
    const antes = await call('boards_gargalos', { time: 'Squad Fiscal' });
    expect(antes.isError).toBe(true);
    expect(antes.text).toContain('boards_sincronizar');

    await call('boards_sincronizar', { time: 'fiscal' });
    const r = JSON.parse((await call('boards_gargalos', { time: 'Squad Fiscal', limite_dias_uteis: 3 })).text);
    expect(r.parametros).toMatchObject({ limite_dias_uteis: 3, top: 5, fuso: 'America/Sao_Paulo' });
    expect(r.squads).toHaveLength(1);
    const s = r.squads[0];
    expect(s.time).toBe('Squad Fiscal');
    expect(s.fonte.sincronizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
    const nomes = s.colunas.map((c: { coluna: string }) => c.coluna);
    expect(nomes).toEqual(['Dev implementando']); // Ideias (backlog) and Concluído (final) are out
    const dev = s.colunas[0];
    expect(dev.itens).toBe(5); // items 1, 2, 3, 6, 7 (all Active)
    // item 1 has a column move in the revisions (9 days ago); the others fall back to the state change
    expect(dev.itens_mais_antigos.find((i: { id: number }) => i.id === 1).data_origem).toBe('mudanca_de_coluna');
    expect(s.ranking_colunas[0].coluna).toBe('Dev implementando');
    expect(r.aviso).toBeUndefined();
    const feat = JSON.parse((await call('boards_gargalos', { time: 'fiscal', tipos: ['Feature'] })).text);
    expect(feat.aviso).toContain('Feature');
    expect(feat.squads[0].colunas).toEqual([]);
    expect(JSON.stringify(r)).not.toContain('ana@empresa.com');
  });

  it('records the call in the audit log', () => {
    expect(queryAudit(db).map((a) => a.tool)).toContain('boards_gargalos');
  });
});
