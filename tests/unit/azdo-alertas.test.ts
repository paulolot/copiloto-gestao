/**
 * T1.4 — Alerts, signals and problem items
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { sincronizarTime } from '../../src/ponte/azure/sync.js';
import { LIMITES_PADRAO, type MetricasTime, type MetricasSprint } from '../../src/ponte/azure/metricas.js';
import {
  atualizarSinais, avaliarSinais, avaliarTime, itensProblema, marcarAvisado, sinaisAtivos, sinaisNaoAvisados,
} from '../../src/ponte/azure/alertas.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

const base = (o: Partial<MetricasTime> = {}): MetricasTime => ({
  time: 't', geradoEm: AGORA.toISOString(), abertos: 0, envelhecendo: 0, bloqueados: 0, bloqueadosAcimaDoLimite: 0,
  wipPorColuna: {}, wipPorPessoa: { maximo: 0, pessoasAcimaDoLimite: 0 }, bugs: { abertos: 0, externosAbertos: 0, semDono: 0 },
  throughputSemanal: Array.from({ length: 8 }, (_, i) => ({ semana: `s${i}`, entregues: 5 })),
  commitsSemanais: Array.from({ length: 8 }, (_, i) => ({ semana: `s${i}`, commits: 20 })),
  commitsPorRepo: [], sprints: [], ...o,
});
const sprint = (nome: string, o: Partial<MetricasSprint> = {}): MetricasSprint => ({ sprint: nome, encerrada: true, itens: 10, entregues: 9, escopoAdicionado: 0, ...o });
const chaves = (m: MetricasTime) => avaliarSinais(m, AGORA, LIMITES_PADRAO).map((s) => s.chave);

describe('avaliarSinais', () => {
  it('is quiet on a healthy team', () => {
    expect(chaves(base())).toEqual([]);
  });

  it('flags aging, blocking, WIP and bugs without owner', () => {
    const k = chaves(base({
      envelhecendo: 2, bloqueadosAcimaDoLimite: 1, wipPorPessoa: { maximo: 5, pessoasAcimaDoLimite: 1 },
      bugs: { abertos: 2, externosAbertos: 1, semDono: 1 },
    }));
    expect(k).toEqual(['envelhecimento', 'bloqueio', 'wip_pessoa', 'bug_sem_dono']);
  });

  it('flags a strong drop in throughput against the 6-week baseline', () => {
    const serie = [5, 5, 5, 5, 5, 5, 1, 3].map((n, i) => ({ semana: `s${i}`, entregues: n }));
    expect(chaves(base({ throughputSemanal: serie }))).toContain('throughput');
    expect(chaves(base({ throughputSemanal: serie.map((s) => ({ ...s, entregues: 5 })) }))).not.toContain('throughput');
  });

  it('flags an active repository that stopped committing', () => {
    const k = chaves(base({ commitsPorRepo: [{ repo: 'r1', ultimoCommit: '2026-10-14', commits28Dias: 9 }] }));
    expect(k).toContain('commit_parado:r1');
    expect(chaves(base({ commitsPorRepo: [{ repo: 'r1', ultimoCommit: '2026-10-20', commits28Dias: 9 }] }))).toEqual([]);
  });

  it('flags commitment below target for 2 sprints in a row, not 1', () => {
    expect(chaves(base({ sprints: [sprint('1'), sprint('2', { compromisso: 60 }), sprint('3', { compromisso: 70 })] }))).toContain('compromisso');
    expect(chaves(base({ sprints: [sprint('1'), sprint('2', { compromisso: 95 }), sprint('3', { compromisso: 70 })] }))).not.toContain('compromisso');
  });

  it('flags cycle time high for 2 sprints against earlier ones', () => {
    const s = [sprint('1', { cycleTimeDias: 4 }), sprint('2', { cycleTimeDias: 4 }), sprint('3', { cycleTimeDias: 7 }), sprint('4', { cycleTimeDias: 8 })];
    expect(chaves(base({ sprints: s }))).toContain('cycle_time');
    expect(chaves(base({ sprints: [s[0], s[1], s[3], sprint('5', { cycleTimeDias: 4 })] }))).not.toContain('cycle_time');
  });

  it('flags bug rate above 10%, MTTR above baseline and added scope', () => {
    const k = chaves(base({
      sprints: [sprint('1', { mttrDias: 2 }), sprint('2', { bugRate: 12, mttrDias: 5 }), sprint('3', { encerrada: false, itens: 10, escopoAdicionado: 4 })],
    }));
    expect(k).toEqual(expect.arrayContaining(['bug_rate', 'mttr', 'escopo']));
  });
});

describe('sinais com data', () => {
  it('keeps the first-seen date, reports new ones once and resolves the gone ones', async () => {
    const db = await makeTestDb();
    const d1 = new Date('2026-10-19T08:00:00Z');
    const d2 = new Date('2026-10-21T08:00:00Z');
    const s = [{ chave: 'bloqueio', severidade: 'vermelho' as const, descricao: 'x' }];
    expect(atualizarSinais(db, 't', s, d1).novos).toHaveLength(1);
    const seg = atualizarSinais(db, 't', s, d2);
    expect(seg.novos).toHaveLength(0);
    expect(seg.ativos[0].desde).toBe(d1.toISOString());
    expect(sinaisNaoAvisados(db)).toHaveLength(1);
    marcarAvisado(db, 't', 'bloqueio');
    expect(sinaisNaoAvisados(db)).toHaveLength(0);
    expect(atualizarSinais(db, 't', [], d2).resolvidos).toEqual(['bloqueio']);
    expect(sinaisAtivos(db)).toHaveLength(0);
    // coming back is a new signal with a new date
    expect(atualizarSinais(db, 't', s, new Date('2026-10-22T08:00:00Z')).novos[0].desde).toBe('2026-10-22T08:00:00.000Z');
  });
});

describe('itensProblema e avaliarTime (fixture)', () => {
  let db: Database;
  beforeAll(async () => {
    db = await makeTestDb();
    await sincronizarTime(db, new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() }), TIMES[0], AGORA);
  });

  it('lists stalled, blocked, ownerless and unestimated items without people', () => {
    const ids = (t: Parameters<typeof itensProblema>[2]) => itensProblema(db, 'fiscal', t, AGORA).map((i) => i.id);
    expect(ids('parados')).toEqual([1]);
    expect(ids('bloqueados')).toEqual([2]);
    expect(ids('sem_dono')).toEqual([3, 6]);
    expect(ids('sem_estimativa')).toEqual([3]);
    expect(JSON.stringify(itensProblema(db, 'fiscal', 'sem_dono', AGORA))).not.toContain('ana@');
  });

  it('evaluates the team end to end and registers signals', () => {
    const r = avaliarTime(db, 'fiscal', AGORA);
    const k = r.sinais.ativos.map((s) => s.chave);
    expect(k).toEqual(expect.arrayContaining(['envelhecimento', 'bloqueio', 'bug_sem_dono', 'escopo']));
    expect(sinaisAtivos(db, 'fiscal').length).toBe(r.sinais.ativos.length);
  });
});
