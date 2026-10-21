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
  it('counts open, aging, blocked and WIP', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA, LIMITES_PADRAO);
    expect(m.abertos).toBe(5); // 1,2,3,6,7
    expect(m.envelhecendo).toBe(1); // item 1 (12 days in state)
    expect(m.bloqueados).toBe(1);
    expect(m.bloqueadosAcimaDoLimite).toBe(1); // changed 5 days ago
    expect(m.wipPorColuna).toEqual({ Active: 5 }); // 1,2,3,6,7
    expect(m.wipPorPessoa).toEqual({ maximo: 3, pessoasAcimaDoLimite: 0 });
  });

  it('counts bugs', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.bugs).toEqual({ abertos: 1, externosAbertos: 0, semDono: 1 });
  });

  it('computes lead and cycle time of recent deliveries', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.leadTimeDias).toBe(5); // item 4: 10→2 days ago = 8; item 5: 8→6 = 2
    expect(m.cycleTimeDias).toBe(3); // item 4: activated 6→2 = 4; item 5 (never activated): created 8→6 = 2
  });

  it('computes throughput per week and commits', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA);
    expect(m.throughputSemanal).toHaveLength(8);
    expect(m.throughputSemanal.reduce((a, s) => a + s.entregues, 0)).toBe(2);
    expect(m.commitsSemanais.reduce((a, s) => a + s.commits, 0)).toBe(5);
    expect(m.commitsPorRepo[0]).toMatchObject({ repo: 'projeto-metaposto-net', commits28Dias: 5 });
  });

  it('computes sprint metrics, MTTR and bug rate', () => {
    const m = calcularMetricas(db, 'fiscal', AGORA);
    const s = m.sprints.find((x) => x.sprint === 'Sprint 42')!;
    expect(s.itens).toBe(7);
    expect(s.entregues).toBe(2);
    expect(s.encerrada).toBe(false);
    expect(s.bugRate).toBe(14.3); // 1 Bug Externo in 7
    expect(s.mttrDias).toBe(2); // item 5
    expect(s.escopoAdicionado).toBe(2); // items 4 and 5 were created after the sprint started
  });

  it('keeps history in snapshots', () => {
    calcularMetricas(db, 'fiscal', AGORA);
    const r = db.exec(`SELECT valor FROM metric_snapshots WHERE periodo = 'sprint:Sprint 42' AND metrica = 'mttr'`);
    expect(r[0].values[0][0]).toBe(2);
  });

  it('never exposes people', () => {
    const json = JSON.stringify(calcularMetricas(db, 'fiscal', AGORA));
    expect(json).not.toContain('ana@empresa.com');
    expect(json).not.toContain('dono');
  });
});
