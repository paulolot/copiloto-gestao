/**
 * T2.9 — attention points, pending decisions, candidates, agenda data and the "no action taken, no agenda" rule
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sql.js';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../src/ponte/app.js';
import { atualizarSinais } from '../../src/ponte/azure/alertas.js';
import {
  ctoPautaDados, ctoPautaSalvar, decisaoCtoAtualizar, decisaoCtoListar, decisaoCtoRegistrar, pontoAtencaoAtualizar, pontoAtencaoCandidatos, pontoAtencaoListar, pontoAtencaoRegistrar,
} from '../../src/ponte/tools/cto.js';
import { makeTestDb } from './helpers.js';

const HOJE = new Date('2026-10-23T15:00:00Z'); // Friday
const antes = (dias: number) => new Date(HOJE.getTime() - dias * 86_400_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
let db: Database;
let raiz: string;
const le = (rel: string) => readFileSync(join(raiz, rel), 'utf8');
function grava(rel: string, txt: string) { const f = join(raiz, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, txt); }

beforeEach(async () => {
  db = await makeTestDb();
  raiz = mkdtempSync(join(tmpdir(), 'vault-cto-'));
  process.env.VAULT_PATH = raiz;
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('pontoAtencaoRegistrar', () => {
  it('takes "desde quando" from the dated signal and warns when "o que já fiz" is missing', () => {
    atualizarSinais(db, 'fiscal', [{ chave: 'envelhecimento', severidade: 'amarelo', descricao: '3 itens parados' }], antes(6));
    const r = pontoAtencaoRegistrar(db, { titulo: 'Itens parados no Fiscal', o_que_vi: '3 itens sem mudança de estado', sinal: 'fiscal:envelhecimento' }, HOJE);
    expect(r.id).toBe('2026-10-23-itens-parados-no-fiscal');
    expect(r.aviso).toContain('o que já fiz');
    expect(le(r.caminho)).toMatch(/^desde: 2026-10-17$/m);
    expect(le(r.caminho)).toMatch(/^revisado: false$/m);
    const [p] = pontoAtencaoListar('aberto');
    expect(p).toMatchObject({ pronto_para_pauta: false, faltando: ['O que já fiz'], desde: '2026-10-17', sinal: 'fiscal:envelhecimento' });
  });

  it('needs a date or a signal, and a known signal', () => {
    expect(() => pontoAtencaoRegistrar(db, { titulo: 'Algo', o_que_vi: 'x' }, HOJE)).toThrow('desde quando');
    expect(() => pontoAtencaoRegistrar(db, { titulo: 'Algo', o_que_vi: 'x', sinal: 'fiscal:nao-existe' }, HOJE)).toThrow('não encontrado');
    expect(() => pontoAtencaoRegistrar(db, { titulo: 'Algo', o_que_vi: 'x', desde: '10/10' }, HOJE)).toThrow('AAAA-MM-DD');
  });

  it('becomes ready once "o que já fiz" is filled, and leaves the open list when resolved', () => {
    const { id } = pontoAtencaoRegistrar(db, { titulo: 'Risco de prazo', o_que_vi: 'Marco apertado', desde: '2026-10-15', preciso: 'Visibilidade' }, HOJE);
    const p = pontoAtencaoAtualizar({ id, campos: { ja_fiz: 'Reordenei o backlog com o PO' } }, HOJE);
    expect(p).toMatchObject({ pronto_para_pauta: true, faltando: [], recomendado_completar: ['O que pode acontecer'] });
    expect(p.campos.preciso).toBe('Visibilidade');
    const r = pontoAtencaoAtualizar({ id, status: 'resolvido', resolucao: 'Marco cumprido' }, HOJE);
    expect(r).toMatchObject({ status: 'resolvido', pronto_para_pauta: false, resolucao: 'Marco cumprido' });
    expect(pontoAtencaoListar('aberto')).toEqual([]);
    expect(pontoAtencaoListar()).toHaveLength(1);
  });

  it('keeps a section the model does not know when updating', () => {
    const { id, caminho } = pontoAtencaoRegistrar(db, { titulo: 'Com nota extra', o_que_vi: 'x', desde: '2026-10-15' }, HOJE);
    writeFileSync(join(raiz, caminho), `${le(caminho)}\n## Notas do Paulo\n\nlembrar de perguntar\n`);
    pontoAtencaoAtualizar({ id, campos: { ja_fiz: 'algo' } }, HOJE);
    expect(le(caminho)).toContain('## Notas do Paulo');
    expect(() => pontoAtencaoAtualizar({ id, campos: { inexistente: 'x' } }, HOJE)).toThrow('Campo desconhecido');
    expect(() => pontoAtencaoAtualizar({ id: 'nao-existe' }, HOJE)).toThrow('não encontrado');
  });
});

describe('decisaoCto', () => {
  it('is only ready with problem, options, recommendation and what happens if nothing is decided', () => {
    const r = decisaoCtoRegistrar({ titulo: 'Migrar o legado', problema: 'Delphi sem dono', opcoes: ['Reescrever', 'Congelar'] }, HOJE);
    expect(r.aviso).toContain('Recomendação');
    expect(decisaoCtoListar('aberto')[0].pronto_para_pauta).toBe(false);
    const d = decisaoCtoAtualizar({ id: r.id, campos: { recomendacao: 'Congelar e migrar por módulo', se_nada: 'O risco de continuidade cresce' } }, HOJE);
    expect(d.pronto_para_pauta).toBe(true);
    expect(d.campos.opcoes).toBe('1. Reescrever\n2. Congelar');
  });
});

describe('pontoAtencaoCandidatos', () => {
  it('suggests old yellow signals, milestones and overdue 1:1s; skips new ones and those already linked', () => {
    atualizarSinais(db, 'fiscal', [
      { chave: 'envelhecimento', severidade: 'amarelo', descricao: 'antigo' },
      { chave: 'wip_pessoa', severidade: 'amarelo', descricao: 'novo' },
    ], antes(8));
    atualizarSinais(db, 'fiscal', [
      { chave: 'envelhecimento', severidade: 'amarelo', descricao: 'antigo' },
      { chave: 'wip_pessoa', severidade: 'amarelo', descricao: 'novo' },
      { chave: 'bloqueio', severidade: 'vermelho', descricao: 'bloqueado' },
    ], antes(0));
    // wip_pessoa disappears and comes back today, so it is new
    atualizarSinais(db, 'fiscal', [{ chave: 'envelhecimento', severidade: 'amarelo', descricao: 'antigo' }], antes(1));
    atualizarSinais(db, 'fiscal', [{ chave: 'envelhecimento', severidade: 'amarelo', descricao: 'antigo' }, { chave: 'wip_pessoa', severidade: 'amarelo', descricao: 'novo' }], HOJE);
    atualizarSinais(db, 'marcos', [{ chave: 'marco:1', severidade: 'vermelho', descricao: 'Marco atrasado' }], HOJE);
    atualizarSinais(db, '1x1', [{ chave: '1x1:ana', severidade: 'amarelo', descricao: '1:1 atrasado' }], HOJE);
    const c = pontoAtencaoCandidatos(db, HOJE);
    expect(c.map((x) => [x.sinal, x.motivo])).toEqual(expect.arrayContaining([
      ['fiscal:envelhecimento', 'sinal amarelo há mais de 3 dias úteis'], ['marcos:marco:1', 'marco em risco'], ['1x1:1x1:ana', '1:1 atrasado'],
    ]));
    expect(c.map((x) => x.sinal)).not.toContain('fiscal:wip_pessoa');
    pontoAtencaoRegistrar(db, { titulo: 'Já tratado', o_que_vi: 'x', sinal: 'fiscal:envelhecimento' }, HOJE);
    expect(pontoAtencaoCandidatos(db, HOJE).map((x) => x.sinal)).not.toContain('fiscal:envelhecimento');
  });
});

describe('ctoPautaDados', () => {
  it('says the agenda is due when there is none, and not when the last one is recent', () => {
    expect((ctoPautaDados(db, {}, HOJE).cadencia as { devida: boolean }).devida).toBe(true);
    grava(`cto/${iso(antes(5))}-pauta.md`, '---\ntipo: pauta-cto\n---\n');
    expect(ctoPautaDados(db, {}, HOJE).cadencia).toMatchObject({ devida: false, dias_desde_a_ultima: 5, proxima_devida: iso(new Date(antes(5).getTime() + 15 * 86_400_000)) });
    grava(`cto/${iso(antes(15))}-pauta.md`, '---\ntipo: pauta-cto\n---\n');
    expect((ctoPautaDados(db, {}, HOJE).cadencia as { ultima_pauta: { data: string } }).ultima_pauta.data).toBe(iso(antes(5)));
  });

  it('lists only reviewed achievements since the last agenda, credits the team, and warns about the ones waiting review', () => {
    grava(`cto/${iso(antes(10))}-pauta.md`, '---\ntipo: pauta-cto\n---\n');
    grava('conquistas/nova.md', `---\ntipo: conquista\ntitulo: "Release limpa"\ndata: ${iso(antes(3))}\ntimes: ["Squad Fiscal"]\nfonte:\n  - "work item #1"\nrevisado: true\n---\nx\n`);
    grava('conquistas/velha.md', `---\ntipo: conquista\ntitulo: "Antiga"\ndata: ${iso(antes(30))}\ntimes: ["Squad Fiscal"]\nrevisado: true\n---\nx\n`);
    grava('conquistas/rascunho.md', `---\ntipo: conquista\ntitulo: "Rascunho"\ndata: ${iso(antes(2))}\ntimes: ["Squad Fiscal"]\nrevisado: false\n---\nx\n`);
    grava('inbox/pendente.md', `---\ntipo: conquista\ntitulo: "Pendente"\ndata: ${iso(antes(1))}\nrevisado: false\n---\nx\n`);
    const d = ctoPautaDados(db, {}, HOJE) as { conquistas: { titulo: string; times: string[]; fontes: string[] }[]; avisos: string[]; desde: string };
    expect(d.desde).toBe(iso(antes(10)));
    expect(d.conquistas).toEqual([expect.objectContaining({ titulo: 'Release limpa', times: ['Squad Fiscal'], fontes: ['work item #1'] })]);
    expect(d.avisos.join(' ')).toContain('1 conquista(s) em inbox/ aguardam');
  });

  it('keeps points without an action already taken out of the ready list', () => {
    pontoAtencaoRegistrar(db, { titulo: 'Sem ação', o_que_vi: 'a', desde: '2026-10-10' }, HOJE);
    pontoAtencaoRegistrar(db, { titulo: 'Com ação', o_que_vi: 'b', desde: '2026-10-10', ja_fiz: 'conversei com o PO' }, HOJE);
    decisaoCtoRegistrar({ titulo: 'Incompleta', problema: 'p' }, HOJE);
    const d = ctoPautaDados(db, {}, HOJE) as { pontos_de_atencao: { prontos_para_pauta: { titulo: string }[]; sem_acao_ja_tomada: { titulo: string; faltando: string[] }[] }; decisoes_pendentes: { prontas: unknown[]; incompletas: unknown[] } };
    expect(d.pontos_de_atencao.prontos_para_pauta.map((p) => p.titulo)).toEqual(['Com ação']);
    expect(d.pontos_de_atencao.sem_acao_ja_tomada).toEqual([{ id: expect.any(String), titulo: 'Sem ação', faltando: ['O que já fiz'] }]);
    expect(d.decisoes_pendentes.incompletas).toHaveLength(1);
    expect(d.decisoes_pendentes.prontas).toHaveLength(0);
  });

  it('flags new red signals as serious and suggests a short notice that still needs approval', () => {
    atualizarSinais(db, 'fiscal', [{ chave: 'bloqueio', severidade: 'vermelho', descricao: '2 itens bloqueados' }], HOJE);
    atualizarSinais(db, '1x1', [{ chave: '1x1:ana', severidade: 'vermelho', descricao: '1:1 muito atrasado' }], HOJE);
    const d = ctoPautaDados(db, {}, HOJE) as { graves_recentes: { chave: string }[]; sugestao_aviso: string; sinais_dos_boards: { chave: string }[] };
    expect(d.graves_recentes.map((s) => s.chave)).toEqual(['bloqueio']);
    expect(d.sinais_dos_boards.map((s) => s.chave)).toEqual(['bloqueio']); // 1:1 signals never go into the CTO data as board signals
    expect(d.sugestao_aviso).toContain('mensagem_propor');
  });
});

describe('ctoPautaSalvar', () => {
  it('refuses a point without an action already taken, or a decision that is incomplete', () => {
    const p = pontoAtencaoRegistrar(db, { titulo: 'Sem ação', o_que_vi: 'a', desde: '2026-10-10' }, HOJE);
    expect(() => ctoPautaSalvar({ texto: 't', fontes: ['f'], pontos_incluidos: [p.id] }, HOJE)).toThrow('Nenhum ponto vai sem "o que já fiz"');
    const d = decisaoCtoRegistrar({ titulo: 'Incompleta', problema: 'p' }, HOJE);
    expect(() => ctoPautaSalvar({ texto: 't', fontes: ['f'], pontos_incluidos: [], decisoes_incluidas: [d.id] }, HOJE)).toThrow('não pode ir à pauta');
    pontoAtencaoAtualizar({ id: p.id, campos: { ja_fiz: 'ok' } }, HOJE);
    pontoAtencaoAtualizar({ id: p.id, status: 'resolvido' }, HOJE);
    expect(() => ctoPautaSalvar({ texto: 't', fontes: ['f'], pontos_incluidos: [p.id] }, HOJE)).toThrow('está resolvido');
  });

  it('stores an unreviewed agenda with its sources and the included ids, never overwriting', () => {
    const p = pontoAtencaoRegistrar(db, { titulo: 'Com ação', o_que_vi: 'a', desde: '2026-10-10', ja_fiz: 'x' }, HOJE);
    const a = ctoPautaSalvar({ texto: '## Conquistas\n\nX', fontes: ['conquistas/nova.md'], pontos_incluidos: [p.id] }, HOJE);
    const b = ctoPautaSalvar({ texto: 'outra', fontes: ['f'], pontos_incluidos: [] }, HOJE);
    expect([a, b]).toEqual(['cto/2026-10-23-pauta.md', 'cto/2026-10-23-pauta-2.md']);
    const t = le(a);
    expect(t).toMatch(/^tipo: pauta-cto$/m);
    expect(t).toMatch(/^revisado: false$/m);
    expect(t).toContain(`  - "${p.id}"`);
    expect(() => ctoPautaSalvar({ texto: ' ', fontes: ['f'], pontos_incluidos: [] }, HOJE)).toThrow('vazio');
    expect(() => ctoPautaSalvar({ texto: 'x', fontes: [], pontos_incluidos: [] }, HOJE)).toThrow('fontes');
  });
});

describe('through MCP: nothing is sent to the CTO', () => {
  let server: Server;
  let client: Client;
  beforeEach(async () => {
    server = createApp(db, 't', { postar: async () => { throw new Error('não deveria postar'); } });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    client = new Client({ name: 'teste', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
  });
  afterEach(async () => { await client.close(); await new Promise<void>((r) => server.close(() => r())); });
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return { text: (r.content as { text: string }[])[0].text, isError: !!r.isError };
  };

  it('registers, lists, builds the data and stores the agenda without touching the approval queue', async () => {
    const r = JSON.parse((await call('ponto_atencao_registrar', { titulo: 'Risco no marco', o_que_vi: 'Marco apertado', desde: '2026-10-10', ja_fiz: 'Reordenei o backlog' })).text);
    expect(JSON.parse((await call('ponto_atencao_listar', {})).text)[0].pronto_para_pauta).toBe(true);
    expect(JSON.parse((await call('cto_pauta_dados', {})).text).pontos_de_atencao.prontos_para_pauta).toHaveLength(1);
    expect((await call('cto_pauta_salvar', { texto: 'Pauta', fontes: ['f'], pontos_incluidos: [r.id] })).text).toContain('nada foi enviado ao CTO');
    expect((await call('cto_pauta_salvar', { texto: 'Pauta', fontes: ['f'], pontos_incluidos: ['nao-existe'] })).isError).toBe(true);
    expect(db.exec('SELECT COUNT(*) FROM approval_queue')[0].values[0][0]).toBe(0);
  });
});
