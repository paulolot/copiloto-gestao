/**
 * T1.3 — Metrics tests (fixture: tests/fixtures/azdo/respostas.ts, "now" = Wed 2026-10-21)
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { sincronizarTime } from '../../src/ponte/azure/sync.js';
import { calcularMetricas, diasUteisEntre, mediana, semanaIso, LIMITES_PADRAO } from '../../src/ponte/azure/metricas.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

let db: Database;

beforeAll(async () => {
  db = await makeTestDb();
  await sincronizarTime(db, new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() }), TIMES[0], AGORA);
});

describe('helpers', () => {
  it('counts business days after the start day', () => {
    // Fri 2026-10-16 → Wed 2026-10-21: Mon, Tue, Wed
    expect(diasUteisEntre(new Date('2026-10-16T10:00:00Z'), new Date('2026-10-21T10:00:00Z'))).toBe(3);
    expect(diasUteisEntre(new Date('2026-10-21T08:00:00Z'), new Date('2026-10-21T10:00:00Z'))).toBe(0);
  });
  it('computes the median and the ISO week', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([])).toBeUndefined();
    expect(semanaIso(new Date('2026-10-21T12:00:00Z'))).toBe('2026-W43');
  });
});

describe('calcularMetricas', () => {
  it('leaves out commits dated more than a day ahead of now', () => {
    db.run("INSERT OR REPLACE INTO commits_dia (time_id, repo, dia, qtd) VALUES ('fiscal','repo-futuro','2026-11-14',2), ('fiscal','repo-futuro','2026-10-22',1), ('fiscal','repo-futuro','2026-10-20',3)");
    const m = calcularMetricas(db, 'fiscal', AGORA, LIMITES_PADRAO);
    const r = m.commitsPorRepo.find((x) => x.repo === 'repo-futuro')!;
    expect(r.ultimoCommit).toBe('2026-10-22'); // tomorrow in UTC is inside the one-day tolerance
    expect(r.commits28Dias).toBe(4);
    expect(m.commitsComDataFutura).toBe(2);
    db.run("DELETE FROM commits_dia WHERE repo = 'repo-futuro'");
  });

  it('counts open, aging, blocked and WIP', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA, LIMITES_PADRAO);
    expect(m.abertos).toBe(5); // 1,2,3,6,7
    expect(m.envelhecendo).toBe(1); // item 1 (12 days in state)
    expect(m.bloqueados).toBe(1);
    expect(m.bloqueadosAcimaDoLimite).toBe(1); // changed 5 days ago
    expect(m.wipPorColuna).toEqual({ 'Dev implementando': 5 }); // 1,2,3,6,7; item 8 is in Ideias and counts nowhere
    expect(m.wipPorPessoa).toEqual({ maximo: 3, pessoasAcimaDoLimite: 0, acimaDoLimite: [] });
    const apertado = calcularMetricas(db, 'fiscal', AGORA, { ...LIMITES_PADRAO, wipPorPessoa: 2 });
    expect(apertado.wipPorPessoa.acimaDoLimite).toEqual([{ nome: 'Ana Souza', itens: [1, 2, 7] }]);
  });

  it('counts bugs', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.bugs).toEqual({ abertos: 1, externosAbertos: 0, semDono: 1 });
  });

  it('computes lead and cycle time of recent deliveries', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.leadTimeDias).toBe(5); // item 4: 10→2 days ago = 8; item 5: 8→6 = 2
    expect(m.cycleTimeDias).toBe(4.5); // from "Fazendo Análise": item 4 9→2 = 7 days; item 5 (skipped it, entered at "Disponível para Dev") 8→6 = 2
  });

  it('computes throughput per week and commits', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.throughputSemanal).toHaveLength(8);
    expect(m.throughputSemanal.reduce((a, s) => a + s.entregues, 0)).toBe(2);
    expect(m.commitsSemanais.reduce((a, s) => a + s.commits, 0)).toBe(5);
    expect(m.commitsPorRepo[0]).toMatchObject({ repo: 'projeto-metaposto-net.git', commits28Dias: 5 });
  });

  it('computes rolling bug rate windows: bugs created (any state) over User Stories resolved, against the window before', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA);
    const por = Object.fromEntries(m.bugRateJanelas.map((j) => [j.dias, j]));
    // bugs 5 and 6 were created 8 and 20 days ago; the only User Story resolved is item 4, closed 2 days ago
    expect(por[7].atual).toEqual({ bugs: 0, userStoriesResolvidas: 1, taxa: 0 });
    expect(por[30].atual).toEqual({ bugs: 2, userStoriesResolvidas: 1, taxa: 200 }); // an open Bug Interno and a closed Bug Externo
    expect(por[90].atual).toEqual({ bugs: 2, userStoriesResolvidas: 1, taxa: 200 });
    expect(por[30].anterior).toEqual({ bugs: 0, userStoriesResolvidas: 0, taxa: undefined });
  });

  it('computes monthly metrics (no sprints), MTTR and bug rate', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.meses.map((x) => x.mes)).toEqual(['2026-10']);
    const o = m.meses[0];
    expect(o).toMatchObject({ encerrado: false, criados: 7, entregues: 2, cycleTimeDias: 4.5, leadTimeDias: 5 });
    expect(o.bugRate).toBe(200); // Bug Interno and Externo both count: 2 bugs created over 1 User Story resolved
    expect(o.mttrDias).toBe(2); // item 5, Backlog → Concluído
  });

  it('gives percentiles of cycle and lead time (P50, P85, P95) and the change failure rate', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA);
    // cycle: item 4 = 7 days, item 5 = 2 days; lead: 8 and 2
    expect(m.cycleTime).toEqual({ p50: 4.5, p85: 6.3, p95: 6.8, amostras: 2 });
    expect(m.leadTime).toEqual({ p50: 5, p85: 7.1, p95: 7.7, amostras: 2 });
    const o = m.meses[0];
    expect(o.cycleTimeP85).toBe(6.3);
    expect(o.leadTimeP85).toBe(7.1);
    expect(o.taxaFalhaMudanca).toBe(50); // 1 Bug Externo created, 2 items delivered
  });

  it('keeps history in snapshots', () => {
    calcularMetricas(db, 'fiscal', AGORA);
    const r = db.exec(`SELECT valor FROM metric_snapshots WHERE periodo = 'mes:2026-10' AND metrica = 'mttr'`);
    expect(r[0].values[0][0]).toBe(2);
  });

  it('never exposes people', () => {
    const json = JSON.stringify(calcularMetricas(db, 'fiscal', AGORA));
    expect(json).not.toContain('ana@empresa.com');
    expect(json).not.toContain('dono');
  });
});
