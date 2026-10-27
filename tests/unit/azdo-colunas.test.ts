/**
 * Board columns: Ideias out of every metric, cycle time from "Fazendo Análise", Bug Interno in bug rate and MTTR
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { colunaDesconhecida, colunaEfetiva, ehIgnorada, emCiclo, iniciouCiclo, iniciouLead, posicaoColuna, terminouCiclo } from '../../src/ponte/azure/colunas.js';
import { sincronizarTime } from '../../src/ponte/azure/sync.js';
import { calcularMetricas, carregarItens } from '../../src/ponte/azure/metricas.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

describe('colunas', () => {
  it('matches names ignoring case and accents, and falls back to the state', () => {
    expect(posicaoColuna('disponivel para dev')).toBe(3);
    expect(colunaEfetiva({ coluna: 'CONCLUIDO', estado: 'Closed' })).toBe('Concluído');
    expect(colunaEfetiva({ coluna: 'Coluna Nova', estado: 'Active' })).toBe('Dev implementando');
    expect(colunaEfetiva({ estado: 'New' })).toBe('Backlog');
  });

  it('puts Ideias and UX out of everything, and ignores them in the flow', () => {
    expect(['Ideias', 'UX', 'ux ', 'Backlog'].map((c) => ehIgnorada({ coluna: c }))).toEqual([true, true, true, false]);
    expect(posicaoColuna('UX')).toBeUndefined();
    expect(emCiclo({ coluna: 'UX', estado: 'Active' })).toBe(false);
    expect(iniciouCiclo('UX')).toBe(false);
  });

  it('matches names regardless of case, accents and extra spaces', () => {
    expect(posicaoColuna('  DISPONIVEL   para dev ')).toBe(3);
    expect(posicaoColuna('release CANDIDATE')).toBe(posicaoColuna('Release candidate'));
    expect(colunaDesconhecida('Aguardando Pipeline')).toBe(false);
    expect(colunaDesconhecida('Aguardando deploy')).toBe(true);
    expect(colunaDesconhecida('UX')).toBe(false);
  });

  it('defines WIP as Fazendo Análise up to Aguardando pipeline; Resolved columns are past the cycle', () => {
    const c = (coluna: string) => ({ coluna, estado: 'Active' });
    expect(['Backlog', 'Concluído', 'Pronto pra release', 'Release candidate'].map((x) => emCiclo(c(x)))).toEqual([false, false, false, false]);
    expect(['Fazendo Análise', 'Disponível para Dev', 'Testando', 'Aguardando pipeline'].map((x) => emCiclo(c(x)))).toEqual([true, true, true, true]);
  });

  it('starts the lead at Backlog, the cycle at Fazendo Análise and ends it at Pronto pra release or later', () => {
    expect(['Ideias', 'Backlog', 'Concluído'].map(iniciouLead)).toEqual([false, true, true]);
    expect(['Backlog', 'Fazendo Análise', 'Concluído'].map(iniciouCiclo)).toEqual([false, true, true]);
    // Squad Fiscal has no Release candidate: going from Aguardando pipeline to Pronto pra release or Concluído both end it
    expect(['Aguardando pipeline', 'Pronto pra release', 'Release candidate', 'Concluído'].map(terminouCiclo)).toEqual([false, true, true, true]);
  });
});

describe('colunas no sync e nas métricas', () => {
  let db: Database;
  beforeEach(async () => {
    db = await makeTestDb();
  });
  const client = (chamadas: { url: string }[] = []) => new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch(chamadas) });

  it('stores Ideias and UX but no metric sees them', async () => {
    await sincronizarTime(db, client(), TIMES[0], AGORA);
    expect(db.exec('SELECT COUNT(*) FROM work_items')[0].values[0][0]).toBe(8);
    expect(carregarItens(db, 'fiscal').map((i) => i.id)).not.toContain(8);
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.abertos).toBe(5);
    expect(m.bugs.abertos).toBe(1); // the Bug Interno in Ideias is not counted
    db.run(`UPDATE work_items SET coluna = 'UX' WHERE id = 7`);
    expect(calcularMetricas(db, 'fiscal', AGORA).abertos).toBe(4);
  });

  it('measures lead from Backlog and cycle from Fazendo Análise to the first arrival at Pronto pra release', async () => {
    await sincronizarTime(db, client(), TIMES[0], AGORA);
    const m = calcularMetricas(db, 'fiscal', AGORA);
    // item 4: Backlog 10 days ago → Concluído 2 days ago = 8; item 5: 8 → 6 = 2
    expect(m.leadTimeDias).toBe(5);
    // item 4: Fazendo Análise 9 → first arrival at the end of the cycle 2 = 7; item 5: 8 → 6 = 2
    expect(m.cycleTimeDias).toBe(4.5);
  });

  it('counts an item waiting for release in the cycle time, but not in the WIP or the lead time', async () => {
    await sincronizarTime(db, client(), TIMES[0], AGORA);
    const dias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();
    // item 7 reached Pronto pra release 3 days ago; no revisions known yet, so it falls back to creation (20 days ago)
    db.run(`UPDATE work_items SET estado = 'Resolved', coluna = 'Pronto pra release', mudanca_estado_em = ? WHERE id = 7`, [dias(3)]);
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.cycleTimeDias).toBe(7); // 17, 7, 2
    expect(m.leadTimeDias).toBe(5); // unchanged: only Concluído counts
    expect(m.wipPorColuna['Pronto pra release']).toBeUndefined();
  });

  it('lists unknown column names in the source of the answers', async () => {
    const { boardsSaude } = await import('../../src/ponte/tools/boards.js');
    await sincronizarTime(db, client(), TIMES[0], AGORA);
    db.run(`UPDATE work_items SET coluna = 'Aguardando deploy' WHERE id = 7`);
    const r = JSON.parse(boardsSaude(db, 'fiscal', AGORA))[0];
    expect(r.fonte.colunasDesconhecidas).toEqual(['Aguardando deploy']);
  });

  it('counts Bug Interno in bug rate and MTTR', async () => {
    await sincronizarTime(db, client(), TIMES[0], AGORA);
    db.run(`UPDATE work_items SET estado = 'Closed', coluna = 'Concluído', fechado_em = ? WHERE id = 6`, [new Date(AGORA.getTime() - 4 * 86_400_000).toISOString()]);
    const s = calcularMetricas(db, 'fiscal', AGORA).meses.find((x) => x.mes === '2026-10')!;
    // item 5 (Externo): 8→6 days = 2; item 6 (Interno): created 20 days ago, closed 4 days ago = 16; mean 9
    expect(s.mttrDias).toBe(9);
    expect(s.bugRate).toBe(200);
  });

  it('fetches the milestones of finished items and the column entry of open ones, once each, and keeps them across syncs', async () => {
    const chamadas: { url: string }[] = [];
    const c = client(chamadas);
    await sincronizarTime(db, c, TIMES[0], AGORA);
    const revisoes = () => chamadas.filter((x) => x.url.includes('/revisions')).map((x) => x.url.match(/workitems\/(\d+)/)![1]);
    expect(revisoes().sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']); // 4 and 5: milestones (finished); the rest: column entry (open)
    const analise = (id: number) => db.exec('SELECT analise_em FROM work_items WHERE id = ?', [id])[0].values[0][0];
    expect(analise(4)).toBeTruthy();
    expect(analise(1)).toBeNull();

    await sincronizarTime(db, c, TIMES[0], new Date(AGORA.getTime() + 3_600_000));
    expect(revisoes()).toHaveLength(8); // not fetched again
    expect(db.exec('SELECT coluna_desde FROM work_items WHERE id = 1')[0].values[0][0]).toBeTruthy();
    expect(analise(4)).toBeTruthy(); // the upsert did not wipe it
  });

  it('does not fail the sync when the revisions of an item fail', async () => {
    const base = fakeFetch();
    const falha = new AzdoClient({ org: 'o', pat: 'p', fetch: async (u, i) => (u.includes('/revisions') ? new Response('{}', { status: 500 }) : base(u, i)) });
    const r = await sincronizarTime(db, falha, TIMES[0], AGORA);
    expect(r.workItems).toBe(8);
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.cycleTimeDias).toBeDefined(); // falls back to activation/creation
  });
});

describe('tipos de work item', () => {
  it('counts only User Story and Bug: Features, Epics, Atendimentos and Tasks are out of every metric', async () => {
    const db = await makeTestDb();
    await sincronizarTime(db, new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() }), TIMES[0], AGORA);
    const antes = calcularMetricas(db, 'fiscal', AGORA);
    db.run(`UPDATE work_items SET tipo = 'Feature' WHERE id = 1`);
    db.run(`UPDATE work_items SET tipo = 'Epic' WHERE id = 2`);
    db.run(`UPDATE work_items SET tipo = 'Atendimento' WHERE id = 7`);
    const depois = calcularMetricas(db, 'fiscal', AGORA);
    expect(antes.abertos - depois.abertos).toBe(3);
    expect(depois.envelhecendo).toBe(0); // item 1 was the stalled one
    expect(depois.bloqueados).toBe(0); // item 2 was the paralisado one
    expect(carregarItens(db, 'fiscal').map((i) => i.tipo).sort()).toEqual(['Bug', 'Bug', 'User Story', 'User Story']);
  });

  it('asks Azure DevOps only for the counted types', async () => {
    const chamadas: { url: string; body?: string }[] = [];
    await new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch(chamadas) }).consultarIds('Metanet', 'Metanet\\Squad Fiscal', {});
    expect(JSON.parse(chamadas[0].body!).query).toContain("[System.WorkItemType] IN ('User Story','Bug')");
  });
});
