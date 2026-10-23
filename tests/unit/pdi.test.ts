/**
 * T2.4 — PDI: creation, structured actions, overdue, 6-month review, and sharing only through the approval queue
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sql.js';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../src/ponte/app.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { getQueueItem } from '../../src/ponte/db/queue.js';
import { competenciasDoPlano, papelLer } from '../../src/ponte/tools/papeis.js';
import { adicionarMeses, escreverAcao, lerAcao, pdiAtrasados, pdiAtualizar, pdiCompartilhar, pdiLer } from '../../src/ponte/tools/pdi.js';
import { makeTestDb } from './helpers.js';

const HOJE = new Date('2026-10-23T15:00:00Z');
let raiz: string;
let db: Database;
const arq = (rel: string) => join(raiz, rel);
const le = (rel: string) => readFileSync(arq(rel), 'utf8');

function plano(revisado = true) {
  mkdirSync(arq('papeis'), { recursive: true });
  const dados = readFileSync(join(process.cwd(), 'vault-template/papeis/tech-lead.md'), 'utf8').replace('revisado: false', `revisado: ${revisado}`);
  writeFileSync(arq('papeis/tech-lead.md'), dados);
}
function perfil() {
  mkdirSync(arq('pessoas/ana-souza'), { recursive: true });
  writeFileSync(arq('pessoas/ana-souza/perfil.md'), '---\ntipo: perfil\npessoa: "Ana Souza"\npapel: "Tech Lead"\ncadencia_1x1: mensal\n---\n');
}
const marcarRevisado = () => writeFileSync(arq('pessoas/ana-souza/pdi.md'), le('pessoas/ana-souza/pdi.md').replace('revisado: false', 'revisado: true'));

beforeEach(async () => {
  raiz = mkdtempSync(join(tmpdir(), 'vault-pdi-'));
  process.env.VAULT_PATH = raiz;
  db = await makeTestDb();
  plano();
  perfil();
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('helpers', () => {
  it('adds months clamping the day', () => {
    expect(adicionarMeses('2026-10-23', 6)).toBe('2027-04-23');
    expect(adicionarMeses('2026-08-31', 6)).toBe('2027-02-28');
    expect(adicionarMeses('2026-12-15', 6)).toBe('2027-06-15');
  });
  it('round-trips an action line, with and without id', () => {
    const a = lerAcao('- [A3] **Mentoria técnica** — competência: Mentoria e autonomia — prazo: 2026-11-30 — status: em andamento', 1)!;
    expect(a).toEqual({ id: 'A3', descricao: 'Mentoria técnica', competencia: 'Mentoria e autonomia', prazo: '2026-11-30', status: 'em andamento' });
    expect(escreverAcao(a)).toBe('- [A3] **Mentoria técnica** — competência: Mentoria e autonomia — prazo: 2026-11-30 — status: em andamento');
    expect(lerAcao('- **Sem id** — status: aberta', 2)?.id).toBe('A2');
    expect(lerAcao('texto solto', 1)).toBeUndefined();
  });
  it('reads the competencies of the shipped Tech Lead plan', () => {
    expect(competenciasDoPlano(papelLer('Tech Lead').corpo)).toEqual(expect.arrayContaining(['Direção técnica', 'Mentoria e autonomia', 'Capacidade instalada']));
  });
});

describe('pdi_atualizar', () => {
  it('creates the PDI from the profile with a 6-month review, unreviewed, and refuses to overwrite', () => {
    const msg = pdiAtualizar('Ana Souza', { acao: 'criar', objetivo: 'Liderar a arquitetura' }, HOJE);
    expect(msg).toContain('pessoas/ana-souza/pdi.md');
    const t = le('pessoas/ana-souza/pdi.md');
    expect(t).toMatch(/^papel: "Tech Lead"$/m);
    expect(t).toMatch(/^proxima_revisao: 2027-04-23$/m);
    expect(t).toMatch(/^revisado: false$/m);
    expect(t).toContain('Liderar a arquitetura');
    expect(() => pdiAtualizar('Ana Souza', { acao: 'criar' }, HOJE)).toThrow('já tem PDI');
  });

  it('adds actions with sequential ids and links them to the role plan', () => {
    pdiAtualizar('Ana Souza', { acao: 'criar' }, HOJE);
    pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'Dividir os reviews', competencia: 'Mentoria e autonomia', prazo: '2026-12-15' }, HOJE);
    pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'Registrar decisões', competencia: 'Direção técnica' }, HOJE);
    const p = pdiLer('Ana Souza', HOJE);
    expect(p.acoes.map((a) => [a.id, a.status])).toEqual([['A1', 'aberta'], ['A2', 'aberta']]);
    expect(p.avisos.filter((a) => a.includes('competência'))).toEqual([]);
    expect(le('pessoas/ana-souza/pdi.md')).toContain('## Notas internas (não compartilhar)');
  });

  it('warns about a competency that is not in the plan and about a draft plan', () => {
    pdiAtualizar('Ana Souza', { acao: 'criar' }, HOJE);
    pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'Algo', competencia: 'Culinária' }, HOJE);
    expect(pdiLer('Ana Souza', HOJE).avisos).toContain('A1: a competência "Culinária" não está no plano do papel');
    plano(false);
    expect(pdiLer('Ana Souza', HOJE).avisos).toContain('O plano do papel "Tech Lead" ainda não foi revisado');
  });

  it('updates only the chosen action, and every edit puts the note back to unreviewed', () => {
    pdiAtualizar('Ana Souza', { acao: 'criar' }, HOJE);
    pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'Primeira', competencia: 'Direção técnica', prazo: '2026-12-01' }, HOJE);
    pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'Segunda', competencia: 'Direção técnica', prazo: '2026-12-02' }, HOJE);
    marcarRevisado();
    pdiAtualizar('Ana Souza', { acao: 'atualizar', id: 'a2', status: 'concluida' }, HOJE);
    const p = pdiLer('Ana Souza', HOJE);
    expect(p.acoes.map((a) => a.status)).toEqual(['aberta', 'concluída']);
    expect(p.acoes[1]).toMatchObject({ descricao: 'Segunda', prazo: '2026-12-02' });
    expect(le('pessoas/ana-souza/pdi.md')).toMatch(/^revisado: false$/m);
    expect(() => pdiAtualizar('Ana Souza', { acao: 'atualizar', id: 'A9', status: 'aberta' }, HOJE)).toThrow('Ids: A1, A2');
    expect(() => pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'x', status: 'feito' }, HOJE)).toThrow('Status inválido');
    expect(() => pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'x', prazo: '12/2026' }, HOJE)).toThrow('AAAA-MM-DD');
  });

  it('registers a review and schedules the next one 6 months ahead', () => {
    pdiAtualizar('Ana Souza', { acao: 'criar' }, new Date('2026-04-01T15:00:00Z'));
    pdiAtualizar('Ana Souza', { acao: 'revisar' }, HOJE);
    const t = le('pessoas/ana-souza/pdi.md');
    expect(t).toMatch(/^ultima_revisao: 2026-10-23$/m);
    expect(t).toMatch(/^proxima_revisao: 2027-04-23$/m);
  });

  it('says so when the person has no PDI', () => {
    expect(() => pdiLer('Ana Souza')).toThrow('ainda não tem PDI');
    expect(() => pdiAtualizar('Ana Souza', { acao: 'revisar' })).toThrow('ainda não tem PDI');
  });
});

describe('pdi_atrasados', () => {
  it('lists open actions past due and overdue reviews, ignoring finished ones', () => {
    pdiAtualizar('Ana Souza', { acao: 'criar' }, new Date('2026-04-01T15:00:00Z')); // review due 2026-10-01
    pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'Vencida', competencia: 'Direção técnica', prazo: '2026-10-13' }, HOJE);
    pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'Feita', prazo: '2026-09-01', status: 'concluída' }, HOJE);
    pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'No prazo', prazo: '2026-11-30' }, HOJE);
    const r = pdiAtrasados(HOJE);
    expect(r.acoes_vencidas.map((a) => [a.pessoa, a.id, a.dias_atraso])).toEqual([['Ana Souza', 'A1', 10]]);
    expect(r.revisoes_vencidas).toEqual([{ pessoa: 'Ana Souza', proxima_revisao: '2026-10-01', dias_atraso: 22 }]);
  });
});

describe('pdi_compartilhar', () => {
  beforeEach(() => {
    pdiAtualizar('Ana Souza', { acao: 'criar', objetivo: 'Liderar a arquitetura' }, HOJE);
    pdiAtualizar('Ana Souza', { acao: 'adicionar', descricao: 'Dividir os reviews', competencia: 'Mentoria e autonomia', prazo: '2026-12-15' }, HOJE);
  });

  it('refuses an unreviewed PDI and one without actions', () => {
    expect(() => pdiCompartilhar(db, 'Ana Souza', 'email')).toThrow('Revise o PDI');
    pdiAtualizar('Bia Costa', { acao: 'criar' }, HOJE);
    writeFileSync(arq('pessoas/bia-costa/pdi.md'), le('pessoas/bia-costa/pdi.md').replace('revisado: false', 'revisado: true'));
    expect(() => pdiCompartilhar(db, 'Bia Costa', 'email')).toThrow('não tem ações');
  });

  it('always queues for approval, with the shareable text only and no name in the audit log', () => {
    marcarRevisado();
    const id = pdiCompartilhar(db, 'Ana Souza', 'email');
    const item = getQueueItem(db, id)!;
    expect(item.state).toBe('pendente');
    expect(item.tool).toBe('pdi_compartilhar');
    expect(item.content).toContain('Dividir os reviews');
    expect(item.content).not.toContain('Notas internas');
    expect(JSON.stringify(queryAudit(db, 5))).not.toContain('Ana');
  });
});

describe('through MCP', () => {
  let server: Server;
  let client: Client;
  beforeEach(async () => {
    server = createApp(db, 't');
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    client = new Client({ name: 'teste', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
  });
  afterEach(async () => { await client.close(); await new Promise<void>((r) => server.close(() => r())); });
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return { text: (r.content as { text: string }[])[0].text, isError: !!r.isError };
  };

  it('creates, reads and shares, keeping the person out of the log', async () => {
    expect((await call('pdi_atualizar', { pessoa: 'Ana Souza', acao: 'criar', objetivo: 'Liderar' })).text).toContain('PDI criado');
    await call('pdi_atualizar', { pessoa: 'Ana Souza', acao: 'adicionar', descricao: 'Dividir os reviews', competencia: 'Direção técnica' });
    expect(JSON.parse((await call('pdi_ler', { pessoa: 'Ana Souza' })).text).acoes).toHaveLength(1);
    expect((await call('pdi_compartilhar', { pessoa: 'Ana Souza', canal: 'email' })).isError).toBe(true);
    marcarRevisado();
    expect((await call('pdi_compartilhar', { pessoa: 'Ana Souza', canal: 'email' })).text).toContain('fila de aprovações');
    expect(JSON.parse((await call('pdi_atrasados', {})).text)).toHaveProperty('acoes_vencidas');
    expect(JSON.stringify(queryAudit(db, 20))).not.toMatch(/Ana|Dividir/);
  });
});
