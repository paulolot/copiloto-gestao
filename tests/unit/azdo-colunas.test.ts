/**
 * Board columns: Ideias out of every metric, cycle time from "Fazendo Análise", Bug Interno in bug rate and MTTR
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { colunaEfetiva, ehIdeia, emCiclo, jaIniciouCiclo, posicaoColuna } from '../../src/ponte/azure/colunas.js';
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

  it('puts Ideias out and defines the cycle from Fazendo Análise to Release candidate', () => {
    const c = (coluna: string) => ({ coluna, estado: 'Active' });
    expect(ehIdeia(c('Ideias'))).toBe(true);
    expect(['Ideias', 'Backlog', 'Concluído'].map((x) => emCiclo(c(x)))).toEqual([false, false, false]);
    expect(['Fazendo Análise', 'Disponível para Dev', 'Testando', 'Release candidate'].map((x) => emCiclo(c(x)))).toEqual([true, true, true, true]);
    expect(jaIniciouCiclo('Backlog')).toBe(false);
    expect(jaIniciouCiclo('Fazendo Análise')).toBe(true);
    expect(jaIniciouCiclo('Concluído')).toBe(true);
  });
});

describe('colunas no sync e nas métricas', () => {
  let db: Database;
  beforeEach(async () => {
    db = await makeTestDb();
  });
  const client = (chamadas: { url: string }[] = []) => new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch(chamadas) });

  it('stores Ideias but no metric sees it', async () => {
    await sincronizarTime(db, client(), TIMES[0], AGORA);
    expect(db.exec('SELECT COUNT(*) FROM work_items')[0].values[0][0]).toBe(8);
    expect(carregarItens(db, 'fiscal').map((i) => i.id)).not.toContain(8);
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.abertos).toBe(5);
    expect(m.bugs.abertos).toBe(1); // the Bug Interno in Ideias is not counted
  });

  it('counts Bug Interno in bug rate and MTTR', async () => {
    await sincronizarTime(db, client(), TIMES[0], AGORA);
    db.run(`UPDATE work_items SET estado = 'Closed', coluna = 'Concluído', fechado_em = ? WHERE id = 6`, [new Date(AGORA.getTime() - 4 * 86_400_000).toISOString()]);
    const s = calcularMetricas(db, 'fiscal', AGORA).sprints.find((x) => x.sprint === 'Sprint 42')!;
    // item 5 (Externo): 8→6 days = 2; item 6 (Interno): created 20 days ago, closed 4 days ago = 16; mean 9
    expect(s.mttrDias).toBe(9);
    expect(s.bugRate).toBe(28.6);
  });

  it('fetches the cycle start only for finished items, once, and keeps it across syncs', async () => {
    const chamadas: { url: string }[] = [];
    const c = client(chamadas);
    await sincronizarTime(db, c, TIMES[0], AGORA);
    const revisoes = () => chamadas.filter((x) => x.url.includes('/revisions')).map((x) => x.url.match(/workitems\/(\d+)/)![1]);
    expect(revisoes().sort()).toEqual(['4', '5']);
    const analise = (id: number) => db.exec('SELECT analise_em FROM work_items WHERE id = ?', [id])[0].values[0][0];
    expect(analise(4)).toBeTruthy();
    expect(analise(1)).toBeNull();

    await sincronizarTime(db, c, TIMES[0], new Date(AGORA.getTime() + 3_600_000));
    expect(revisoes()).toHaveLength(2); // not fetched again
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
