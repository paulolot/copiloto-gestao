/**
 * T2.6 — 1:1 agenda: aggregated data with sources, restricted storage, only the path reaches Discord
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sql.js';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { sincronizarTime } from '../../src/ponte/azure/sync.js';
import { createApp } from '../../src/ponte/app.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { combinadosDe, umAUmPreparar, umAUmSalvarPauta } from '../../src/ponte/tools/pauta-1x1.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

let db: Database;
let raiz: string;
const dia = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString().slice(0, 10);

function grava(rel: string, txt: string) {
  const f = join(raiz, rel);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, txt);
}

beforeAll(async () => {
  db = await makeTestDb();
  await sincronizarTime(db, new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() }), TIMES[0], AGORA);
});

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'vault-pauta-'));
  process.env.VAULT_PATH = raiz;
  grava('pessoas/ana/perfil.md', '---\ntipo: perfil\npessoa: "Ana Souza"\ntime: "Squad Fiscal"\nazure_devops_id: "Ana Souza"\ncadencia_1x1: mensal\n---\n\nPerfil sigiloso.\n');
  grava('pessoas/ana/pdi.md', `---\ntipo: pdi\npessoa: "Ana Souza"\npapel: "Dev"\nproxima_revisao: ${dia(-60)}\nrevisado: true\n---\n\n## Objetivo\n\nCrescer.\n\n## Ações\n\n- [A1] **Dividir os reviews** — prazo: ${dia(5)} — status: aberta\n- [A2] **Registrar decisões** — prazo: ${dia(-30)} — status: aberta\n- [A3] **Feita** — status: concluída\n`);
  grava(`pessoas/ana/1x1/${dia(30)}-1x1.md`, `---\ntipo: 1x1\ndata: ${dia(30)}\n---\n\n## Temas\n\nConversa sigilosa.\n\n## Combinados\n\n- Revisar o desenho da integração (Ana, 15 dias)\n- Enviar o resumo do curso\n\n## Próximos passos\n\n- —\n`);
  grava('pessoas/ana/2026-01-01-impressao.md', `---\ntipo: impressao\ndata: ${dia(60)}\n---\n\nAntiga, antes do último 1:1.\n`);
  grava(`pessoas/ana/${dia(10)}-feedback.md`, `---\ntipo: feedback\ndata: ${dia(10)}\n---\n\nBoa condução da release.\n`);
  grava('conquistas/nova.md', `---\ntipo: conquista\ntitulo: "Release fiscal limpa"\ndata: ${dia(8)}\ntimes: ["Squad Fiscal"]\nrevisado: true\n---\nx\n`);
  grava('conquistas/velha.md', `---\ntipo: conquista\ntitulo: "Antiga"\ndata: ${dia(90)}\ntimes: ["Squad Fiscal"]\nrevisado: true\n---\nx\n`);
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));
afterAll(() => undefined);

describe('combinadosDe', () => {
  it('reads the bullets under Combinados and ignores the placeholder dash', () => {
    expect(combinadosDe('## Combinados\n\n- A\n- B\n\n## Próximos passos\n\n- —\n')).toEqual(['A', 'B']);
    expect(combinadosDe('sem seção')).toEqual([]);
  });
});

describe('umAUmPreparar', () => {
  it('gathers PDI, agreements, records since the last 1:1, achievements, board and topics, with sources', () => {
    const r = umAUmPreparar(db, 'Ana', AGORA);
    expect(r.pessoa).toBe('Ana Souza');
    expect(r.ultimo_1x1).toMatchObject({ data: dia(30), combinados: ['Revisar o desenho da integração (Ana, 15 dias)', 'Enviar o resumo do curso'], sem_conteudo: false });
    expect(r.pdi?.acoes.map((a) => [a.id, a.vencida])).toEqual([['A1', true], ['A2', false], ['A3', false]]);
    expect(r.registros_desde_o_ultimo_1x1.map((x) => x.caminho)).toEqual([`pessoas/ana/${dia(10)}-feedback.md`]);
    expect(r.conquistas_do_time).toEqual([{ caminho: 'conquistas/nova.md', titulo: 'Release fiscal limpa' }]);
    expect((r.board as { colaboradores: unknown[] }).colaboradores).toHaveLength(1);
    const temas = r.temas_sugeridos.map((t) => t.tema).join(' | ');
    expect(temas).toContain('Ações do PDI com prazo vencido: A1');
    expect(temas).not.toContain('sem prazo'); // the only action without a deadline (A3) is already done
    expect(temas).toContain('Itens parados há 7 dias ou mais: #1');
    expect(temas).toContain('paralisado');
    expect(r.temas_sugeridos.every((t) => t.fonte)).toBe(true);
  });

  it('does not count a generated agenda as the last 1:1', () => {
    umAUmSalvarPauta('Ana', { texto: 'pauta', fontes: ['x'], data: dia(1) }, AGORA);
    expect(umAUmPreparar(db, 'Ana', AGORA).ultimo_1x1.data).toBe(dia(30));
  });

  it('works without the board and warns when the last 1:1 is only a marker', () => {
    grava(`pessoas/ana/1x1/${dia(5)}-1x1.md`, '---\ntipo: 1x1\n---\n\nRegistro de marcador: sem anotações.\n');
    const r = umAUmPreparar(undefined, 'Ana', AGORA);
    expect(r.board).toBeNull();
    expect(r.ultimo_1x1).toMatchObject({ data: dia(5), sem_conteudo: true });
    expect(r.avisos.join(' ')).toContain('só um marcador');
  });

  it('says when there is no profile, PDI or 1:1', () => {
    expect(umAUmPreparar(undefined, 'Novo Colega', AGORA).avisos).toEqual(['Sem perfil.md: papel, time e cadência desconhecidos', 'Nenhum 1:1 registrado', 'Sem PDI']);
  });
});

describe('umAUmSalvarPauta', () => {
  it('stores a restricted, unreviewed agenda with sources; never overwrites', () => {
    const a = umAUmSalvarPauta('Ana', { texto: 'Pauta da Ana', fontes: ['pessoas/ana/pdi.md'], data: '2026-11-05' }, AGORA);
    const b = umAUmSalvarPauta('Ana', { texto: 'Outra', fontes: ['x'], data: '2026-11-05' }, AGORA);
    expect([a, b]).toEqual(['pessoas/ana/1x1/2026-11-05-pauta.md', 'pessoas/ana/1x1/2026-11-05-pauta-2.md']);
    const t = readFileSync(join(raiz, a), 'utf8');
    expect(t).toMatch(/^tipo: pauta$/m);
    expect(t).toMatch(/^restrito: true$/m);
    expect(t).toMatch(/^revisado: false$/m);
    expect(t).toContain('  - "pessoas/ana/pdi.md"');
  });
  it('requires text, sources and a valid date', () => {
    expect(() => umAUmSalvarPauta('Ana', { texto: ' ', fontes: ['x'] })).toThrow('vazio');
    expect(() => umAUmSalvarPauta('Ana', { texto: 'x', fontes: [] })).toThrow('fontes');
    expect(() => umAUmSalvarPauta('Ana', { texto: 'x', fontes: ['x'], data: '5/11' })).toThrow('AAAA-MM-DD');
  });
});

describe('through MCP', () => {
  let server: Server;
  let client: Client;
  const posts: { canal: string; texto: string }[] = [];
  beforeEach(async () => {
    posts.length = 0;
    server = createApp(db, 't', { postar: async (canal, texto) => void posts.push({ canal, texto }) });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    client = new Client({ name: 'teste', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
  });
  afterEach(async () => { await client.close(); await new Promise<void>((r) => server.close(() => r())); });
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return { text: (r.content as { text: string }[])[0].text, isError: !!r.isError };
  };

  it('prepares and saves; Discord gets only the path and the log keeps no name or content', async () => {
    expect(JSON.parse((await call('um_a_um_preparar', { pessoa: 'Ana' })).text).pessoa).toBe('Ana Souza');
    const r = await call('um_a_um_salvar_pauta', { pessoa: 'Ana', texto: 'Texto sigiloso da pauta', fontes: ['pessoas/ana/pdi.md'], data: '2026-11-05' });
    expect(r.text).toContain('pessoas/ana/1x1/2026-11-05-pauta.md');
    expect(posts).toEqual([{ canal: 'pessoas', texto: 'Pauta de 1:1 pronta em pessoas/ana/1x1/2026-11-05-pauta.md' }]);
    expect(JSON.stringify(queryAudit(db, 10))).not.toMatch(/Ana Souza|sigiloso/);
  });

  it('refuses a pauta without sources and posts nothing', async () => {
    const r = await call('um_a_um_salvar_pauta', { pessoa: 'Ana', texto: 'x', fontes: [] });
    expect(r.isError).toBe(true);
    expect(posts).toEqual([]);
  });

  it('still saves when Discord is down and says so', async () => {
    const down = createApp(db, 't', { postar: async () => { throw new Error('Discord fora'); } });
    await new Promise<void>((r) => down.listen(0, '127.0.0.1', r));
    const c = new Client({ name: 't2', version: '0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(down.address() as AddressInfo).port}/mcp`), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
    const r = await c.callTool({ name: 'um_a_um_salvar_pauta', arguments: { pessoa: 'Ana', texto: 'x', fontes: ['f'], data: '2026-11-06' } });
    const t = (r.content as { text: string }[])[0].text;
    expect(t).toContain('Pauta salva em pessoas/ana/1x1/2026-11-06-pauta.md');
    expect(t).toContain('não foi enviado');
    await c.close();
    await new Promise<void>((r2) => down.close(() => r2()));
  });
});
