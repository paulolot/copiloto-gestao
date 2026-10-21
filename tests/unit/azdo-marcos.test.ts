/**
 * Delivery milestones: a date + the work items marked by an arbitrary tag
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { sincronizarTime } from '../../src/ponte/azure/sync.js';
import { marcoAtualizar, marcoListar, marcoObter, marcoRegistrar, sinaisDeMarcos, statusDoMarco, tagsEmUso } from '../../src/ponte/azure/marcos.js';
import { boardsMarcoRegistrar, boardsMarcos } from '../../src/ponte/tools/boards.js';
import { executarCiclo } from '../../src/ponte/agendador.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

let db: Database;
const client = () => new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() });
const marco = (data: string, tag = 'Entrega-X7') => marcoObter(db, marcoRegistrar(db, { nome: 'Entrega NFC-e', tag, data, timeId: 'fiscal' }))!;

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

describe('registro', () => {
  it('registers, lists, and refuses a bad date or a tag already used by an active milestone', () => {
    const m = marco('2026-11-04');
    expect(marcoListar(db).map((x) => x.id)).toEqual([m.id]);
    expect(() => marcoRegistrar(db, { nome: 'x', tag: 'entrega-x7', data: '2026-12-01' })).toThrow('já está no marco');
    expect(() => marcoRegistrar(db, { nome: 'x', tag: 'outra', data: '04/11/2026' })).toThrow('AAAA-MM-DD');
  });

  it('counts a postponement only when the date moves later, and keeps the original date', () => {
    const m = marco('2026-11-04');
    expect(marcoAtualizar(db, m.id, { data: '2026-11-18' })).toMatchObject({ data: '2026-11-18', dataOriginal: '2026-11-04', adiamentos: 1 });
    expect(marcoAtualizar(db, m.id, { data: '2026-11-10' })).toMatchObject({ data: '2026-11-10', adiamentos: 1 });
    expect(marcoAtualizar(db, m.id, { estado: 'entregue' }).estado).toBe('entregue');
    expect(marcoListar(db)).toHaveLength(0);
    expect(marcoListar(db, { incluirEncerrados: true })).toHaveLength(1);
    expect(() => marcoAtualizar(db, 99, {})).toThrow('não existe');
  });

  it('the tool warns when no synced item has the tag', () => {
    const r = JSON.parse(boardsMarcoRegistrar(db, { nome: 'Fantasma', tag: 'nao-existe', data: '2026-12-01', time: 'fiscal' }, AGORA));
    expect(r.aviso).toContain('nao-existe');
    const ok = JSON.parse(boardsMarcoRegistrar(db, { nome: 'Real', tag: 'entrega-x7', data: '2026-12-01', time: 'fiscal' }, AGORA));
    expect(ok.itensComATag).toBe(5); // item 8 is in Ideias and does not count
  });
});

describe('status', () => {
  it('counts the items by tag (case and accents ignored), without the Ideias column', () => {
    const s = statusDoMarco(db, marco('2026-11-04'), AGORA);
    expect(s).toMatchObject({ totalItens: 5, entregues: 1, aguardandoRelease: 1, emAndamento: 3, naoIniciados: 0, abertos: 4, percentualEntregue: 20, diasAteAData: 14 });
    expect(s.paralisados.map((i) => i.id)).toEqual([2]);
    expect(s.parados.map((i) => i.id)).toEqual([1]);
  });

  it('estimates the risk against the usual pace (2 items finished in 8 weeks = 0.25 per week)', () => {
    const risco = (d: string, tag: string) => statusDoMarco(db, marco(d, tag), AGORA);
    const alto = risco('2026-11-04', 'entrega-x7');
    expect(alto).toMatchObject({ ritmoSemanal: 0.3, risco: 'alto' }); // 4 open > 0.5 expected in 2 weeks
    marcoAtualizar(db, alto.id, { data: '2027-03-10' }); // 140 days = 20 weeks → 5 expected: 4 open is within it but above 70%
    expect(statusDoMarco(db, marcoObter(db, alto.id)!, AGORA).risco).toBe('atencao');
    marcoAtualizar(db, alto.id, { data: '2027-09-01' });
    expect(statusDoMarco(db, marcoObter(db, alto.id)!, AGORA).risco).toBe('ok');
  });

  it('is atrasado when the date has passed with open items, concluido when nothing is left, indeterminado without items', () => {
    const m = marco('2026-10-20');
    expect(statusDoMarco(db, m, AGORA).risco).toBe('atrasado');
    db.run(`UPDATE work_items SET estado = 'Closed', coluna = 'Concluído' WHERE id IN (1, 2, 3, 7)`);
    expect(statusDoMarco(db, m, AGORA).risco).toBe('concluido');
    const vazio = marcoObter(db, marcoRegistrar(db, { nome: 'Vazio', tag: 'sem-itens', data: '2026-12-01' }))!;
    expect(statusDoMarco(db, vazio, AGORA).risco).toBe('indeterminado');
  });

  it('lists tags in use on open items to help pick the tag', () => {
    const tags = tagsEmUso(db, ['fiscal']).map((t) => t.tag.toLowerCase());
    expect(tags).toContain('fiscal');
    expect(tags.filter((t) => t.startsWith('entr')).length).toBeGreaterThan(0);
  });

  it('the tool returns the observation about the estimate and never a person', () => {
    marco('2026-11-04');
    const txt = boardsMarcos(db, {}, AGORA);
    expect(JSON.parse(txt).observacao).toContain('estimativa');
    expect(txt).not.toContain('ana@empresa.com');
  });
});

describe('sinais', () => {
  it('raises a red signal for a milestone at high risk and none for a comfortable one', () => {
    const m = marco('2026-11-04');
    expect(sinaisDeMarcos(db, AGORA)).toEqual([expect.objectContaining({ chave: `marco:${m.id}`, severidade: 'vermelho' })]);
    marcoAtualizar(db, m.id, { data: '2027-09-01' });
    expect(sinaisDeMarcos(db, AGORA)).toEqual([]);
  });

  it('the hourly cycle posts the milestone signal to #alertas once, with the date it first appeared', async () => {
    marco('2026-11-04');
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
    const client = () => comTag;
    await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: AGORA });
    const deMarco = posts.filter((p) => p.includes('Marco "Entrega NFC-e"'));
    expect(deMarco).toHaveLength(1);
    expect(deMarco[0]).toContain('04/11');
    posts.length = 0;
    await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: new Date(AGORA.getTime() + 3_600_000) });
    expect(posts.filter((p) => p.includes('Marco "Entrega NFC-e"'))).toHaveLength(0);
  });
});
