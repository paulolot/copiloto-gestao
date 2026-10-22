/**
 * Delivery milestones: a date + the work items marked by an arbitrary tag
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { sincronizarTime } from '../../src/ponte/azure/sync.js';
import { marcoDefinir, marcoListar, marcoObter, sinaisDeMarcos, statusDoMarco, tagsEmUso } from '../../src/ponte/azure/marcos.js';
import { boardsMarcoDefinir, boardsMarcos } from '../../src/ponte/tools/boards.js';
import { executarCiclo } from '../../src/ponte/agendador.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

let db: Database;
const DIA = 86_400_000;
const em = (dias: number) => new Date(AGORA.getTime() + dias * DIA).toISOString().slice(0, 10);
const client = () => new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() });
const definir = (e: Parameters<typeof marcoDefinir>[1]) => marcoDefinir(db, { timeId: 'fiscal', ...e }).marco;
const marco = (data: string, tag = 'Entrega-X7', extra: Partial<Parameters<typeof marcoDefinir>[1]> = {}) => definir({ nome: 'Entrega NFC-e', tag, data, ...extra });

beforeEach(async () => {
  db = await makeTestDb();
  await sincronizarTime(db, client(), TIMES[0], AGORA);
  // items 1, 2, 3, 7 are open (1 stalled, 2 paralisado), 4 is delivered; 8 is in Ideias and out of every metric
  db.run(`UPDATE work_items SET tags = 'entrega-x7' WHERE id IN (1, 4)`);
  db.run(`UPDATE work_items SET tags = 'fiscal; ENTREGA-X7' WHERE id = 2`);
  db.run(`UPDATE work_items SET tags = 'Entrégà-X7' WHERE id = 3`);
  db.run(`UPDATE work_items SET tags = 'Entrega-X7', coluna = 'Pronto pra release', estado = 'Resolved' WHERE id = 7`);
  db.run(`UPDATE work_items SET tags = 'Entrega-X7' WHERE id = 8`);
});

describe('regras do marco, definidas quando o Paulo quiser', () => {
  it('keeps the rules of the next milestone while it has no tag or date yet', () => {
    const m = definir({ nome: 'Próxima entrega fiscal', confianca: 95, janelaSemanas: 8, escopoFechado: true, observacao: 'Só NFC-e; sem itens de relatório' });
    expect(m).toMatchObject({ estado: 'planejado', tag: undefined, regras: { confianca: 95, janelaSemanas: 8, escopoFechado: true, observacao: 'Só NFC-e; sem itens de relatório' } });
    expect(statusDoMarco(db, m, AGORA)).toMatchObject({ estado: 'planejado', totalItens: 0 });
    expect(sinaisDeMarcos(db, AGORA)).toEqual([]);
  });

  it('completes the planned milestone of the team when the tag and the date arrive, keeping its rules', () => {
    const plan = definir({ nome: 'Próxima entrega fiscal', confianca: 95 });
    const { marco: ativo, criado } = marcoDefinir(db, { timeId: 'fiscal', tag: 'Entrega-X7', data: em(30) });
    expect(criado).toBe(false);
    expect(ativo).toMatchObject({ id: plan.id, estado: 'ativo', nome: 'Próxima entrega fiscal', regras: { confianca: 95 }, escopoInicial: 5 });
    expect(marcoListar(db)).toHaveLength(1);
  });

  it('keeps one planned milestone per team and does not mix teams', () => {
    const a = definir({ confianca: 70 });
    const b = marcoDefinir(db, { timeId: 'retaguarda', confianca: 90 }).marco;
    expect(a.id).not.toBe(b.id);
    expect(marcoListar(db).map((m) => m.regras.confianca).sort()).toEqual([70, 90]);
    expect(definir({ confianca: 80 }).id).toBe(a.id); // same team: changes the planned one
  });

  it('a call with a tag already in use changes that milestone instead of failing', () => {
    const m = marco(em(30));
    const { marco: igual, criado } = marcoDefinir(db, { tag: 'ENTREGA-x7', data: em(40), confianca: 70 });
    expect(criado).toBe(false);
    expect(igual).toMatchObject({ id: m.id, data: em(40), adiamentos: 1, regras: { confianca: 70 } });
  });

  it('counts a postponement only when the date moves later, and keeps the original date', () => {
    const m = marco(em(10));
    expect(definir({ id: m.id, data: em(24) })).toMatchObject({ data: em(24), dataOriginal: em(10), adiamentos: 1 });
    expect(definir({ id: m.id, data: em(20) })).toMatchObject({ data: em(20), adiamentos: 1 });
    expect(definir({ id: m.id, estado: 'entregue' }).estado).toBe('entregue');
    expect(marcoListar(db)).toHaveLength(0);
    expect(marcoListar(db, { incluirEncerrados: true })).toHaveLength(1);
  });

  it('validates the rules', () => {
    expect(() => definir({ confianca: 40 })).toThrow('50 a 99');
    expect(() => definir({ janelaSemanas: 2 })).toThrow('4 a 52');
    expect(() => definir({ tipos: ['Epic'] })).toThrow('fora dos que entram');
    expect(() => definir({ data: '04/11/2026' })).toThrow('AAAA-MM-DD');
    expect(() => marcoDefinir(db, { id: 99 })).toThrow('não existe');
  });

  it('uses the types of the rule: only Bug counts when the rule says so', () => {
    const m = marco(em(60), 'Entrega-X7', { tipos: ['Bug'] });
    expect(statusDoMarco(db, m, AGORA).totalItens).toBe(0); // the tagged items are all User Story
  });

  it('warns about items that joined the tag after an "escopo fechado" milestone was set', () => {
    const m = marco(em(60), 'Entrega-X7', { escopoFechado: true });
    expect(statusDoMarco(db, m, AGORA).itensAdicionadosDepoisDoRegistro).toBe(0);
    db.run(`UPDATE work_items SET tags = 'entrega-x7' WHERE id = 6`);
    expect(statusDoMarco(db, m, AGORA).itensAdicionadosDepoisDoRegistro).toBe(1);
    expect(sinaisDeMarcos(db, AGORA).map((s) => s.chave)).toContain(`marco-escopo:${m.id}`);
    const aberto = marco(em(60), 'Outra-Tag');
    expect(statusDoMarco(db, aberto, AGORA).itensAdicionadosDepoisDoRegistro).toBeUndefined();
  });

  it('the tool tells what was registered and warns when no item has the tag', () => {
    const fantasma = JSON.parse(boardsMarcoDefinir(db, { nome: 'Fantasma', tag: 'nao-existe', data: em(30), time: 'fiscal' }, AGORA));
    expect(fantasma.aviso).toContain('nao-existe');
    const plan = JSON.parse(boardsMarcoDefinir(db, { time: 'retaguarda', confianca: 90 }, AGORA));
    expect(plan.acao).toBe('criado');
    expect(plan.aviso).toContain('planejado');
  });
});

describe('status e previsão', () => {
  it('counts the items by tag (case and accents ignored), without the Ideias column', () => {
    const s = statusDoMarco(db, marco(em(14)), AGORA);
    expect(s).toMatchObject({ totalItens: 5, entregues: 1, aguardandoRelease: 1, emAndamento: 3, naoIniciados: 0, abertos: 4, percentualEntregue: 20, diasAteAData: 14 });
    expect(s.paralisados.map((i) => i.id)).toEqual([2]);
    expect(s.parados.map((i) => i.id)).toEqual([1]);
  });

  it('forecasts with the real weekly throughput of the window (2 items finished this week, none in the 11 before)', () => {
    const s = statusDoMarco(db, marco(em(14)), AGORA);
    expect(s.previsao!.vazaoSemanal).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
    expect(s.previsao!.itensRestantes).toBe(4);
  });

  it('judges the risk by the chance of making the date against the confidence the rules ask for', () => {
    const m = marco(em(14)); // 2 weeks for 4 items at a pace of 2 in 12 weeks
    expect(statusDoMarco(db, m, AGORA)).toMatchObject({ risco: 'alto' });
    definir({ id: m.id, data: em(245) }); // ~35 weeks: chance around 80%
    const meio = statusDoMarco(db, marcoObter(db, m.id)!, AGORA);
    expect(meio.previsao!.probabilidadeAteAData!).toBeGreaterThan(0.7);
    expect(meio.previsao!.probabilidadeAteAData!).toBeLessThan(0.85);
    expect(meio.risco).toBe('atencao'); // default rule asks for 85%
    definir({ id: m.id, confianca: 70 });
    expect(statusDoMarco(db, marcoObter(db, m.id)!, AGORA).risco).toBe('ok'); // same data, a looser rule
    definir({ id: m.id, data: em(400), confianca: 85 });
    expect(statusDoMarco(db, marcoObter(db, m.id)!, AGORA).risco).toBe('ok');
  });

  it('gives P50/P85/P95 dates, ordered', () => {
    const p = statusDoMarco(db, marco(em(30)), AGORA).previsao!;
    expect(p.dataP50! <= p.dataP85! && p.dataP85! <= p.dataP95!).toBe(true);
    expect(p.dataNaConfianca).toBe(p.dataP85);
  });

  it('is atrasado when the date has passed with open items, concluido when nothing is left, indeterminado without items', () => {
    const m = marco(em(-1));
    expect(statusDoMarco(db, m, AGORA).risco).toBe('atrasado');
    db.run(`UPDATE work_items SET estado = 'Closed', coluna = 'Concluído' WHERE id IN (1, 2, 3, 7)`);
    expect(statusDoMarco(db, m, AGORA).risco).toBe('concluido');
    const vazio = definir({ nome: 'Vazio', tag: 'sem-itens', data: em(30) });
    expect(statusDoMarco(db, vazio, AGORA).risco).toBe('indeterminado');
  });

  it('lists tags in use on open items to help pick the tag', () => {
    const tags = tagsEmUso(db, ['fiscal']).map((t) => t.tag.toLowerCase());
    expect(tags).toContain('fiscal');
    expect(tags.filter((t) => t.startsWith('entr')).length).toBeGreaterThan(0);
  });

  it('the tool returns the note about the forecast and never a person', () => {
    marco(em(14));
    const txt = boardsMarcos(db, {}, AGORA);
    expect(JSON.parse(txt).observacao).toContain('Monte Carlo');
    expect(txt).not.toContain('ana@empresa.com');
  });
});

describe('sinais', () => {
  it('raises a red signal with chance, required confidence and date for a milestone at high risk, and none for a comfortable one', () => {
    const m = marco(em(14));
    const [s] = sinaisDeMarcos(db, AGORA);
    expect(s).toMatchObject({ chave: `marco:${m.id}`, severidade: 'vermelho' });
    expect(s.descricao).toContain('a regra exige 85%');
    expect(s.descricao).toContain('P85 estima');
    definir({ id: m.id, data: em(400) });
    expect(sinaisDeMarcos(db, AGORA)).toEqual([]);
  });

  it('the hourly cycle posts the milestone signal to #alertas once, with the date it first appeared', async () => {
    marco(em(14));
    const posts: string[] = [];
    const postar = async (_c: string, t: string) => void posts.push(t);
    // the sync rewrites the tags, so the simulated Azure DevOps has to carry them
    const base = fakeFetch();
    const comTag = new AzdoClient({
      org: 'o', pat: 'p',
      fetch: async (u, i) => {
        const r = await base(u, i);
        if (!u.includes('/workitemsbatch')) return r;
        const j = (await r.json()) as { value: { id: number; fields: Record<string, unknown> }[] };
        j.value.forEach((w) => { if ([1, 2, 3, 4, 7].includes(w.id)) w.fields['System.Tags'] = 'entrega-x7'; });
        return new Response(JSON.stringify(j));
      },
    });
    await executarCiclo({ db, azdo: comTag, postar, times: [TIMES[0]], agora: AGORA });
    const deMarco = posts.filter((p) => p.includes('Marco "Entrega NFC-e"'));
    expect(deMarco).toHaveLength(1);
    posts.length = 0;
    await executarCiclo({ db, azdo: comTag, postar, times: [TIMES[0]], agora: new Date(AGORA.getTime() + 3_600_000) });
    expect(posts.filter((p) => p.includes('Marco "Entrega NFC-e"'))).toHaveLength(0);
  });
});
