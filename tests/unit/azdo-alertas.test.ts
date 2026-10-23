/**
 * T1.4 — Alerts, signals and problem items
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { sincronizarTime } from '../../src/ponte/azure/sync.js';
import { LIMITES_PADRAO, type JanelaBugRate, type MetricasTime, type MetricasMes } from '../../src/ponte/azure/metricas.js';
import {
  atualizarSinais, avaliarSinais, avaliarTime, itensProblema, marcarAvisado, marcarResolucaoAvisada, sinaisAtivos, sinaisNaoAvisados, sinaisResolvidosNaoAvisados,
} from '../../src/ponte/azure/alertas.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

const base = (o: Partial<MetricasTime> = {}): MetricasTime => ({
  time: 't', geradoEm: AGORA.toISOString(), abertos: 0, envelhecendo: 0, bloqueados: 0, bloqueadosAcimaDoLimite: 0,
  wipPorColuna: {}, wipPorPessoa: { maximo: 0, pessoasAcimaDoLimite: 0, acimaDoLimite: [] }, bugs: { abertos: 0, externosAbertos: 0, semDono: 0 },
  throughputSemanal: Array.from({ length: 8 }, (_, i) => ({ semana: `s${i}`, entregues: 5 })),
  commitsSemanais: Array.from({ length: 8 }, (_, i) => ({ semana: `s${i}`, commits: 20 })),
  bugRateJanelas: [], commitsPorRepo: [], meses: [], cycleTime: { amostras: 0 }, leadTime: { amostras: 0 }, ...o,
});
const mes = (nome: string, o: Partial<MetricasMes> = {}): MetricasMes => ({ mes: nome, inicio: '', fim: '', encerrado: true, criados: 10, entregues: 9, ...o });
const chaves = (m: MetricasTime) => avaliarSinais(m, AGORA, LIMITES_PADRAO).map((s) => s.chave);

describe('avaliarSinais', () => {
  it('is quiet on a healthy team', () => {
    expect(chaves(base())).toEqual([]);
  });

  it('flags aging, blocking, WIP and bugs without owner', () => {
    const k = chaves(base({
      envelhecendo: 2, bloqueadosAcimaDoLimite: 1, wipPorPessoa: { maximo: 5, pessoasAcimaDoLimite: 1, acimaDoLimite: [] },
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

  it('flags cycle time high for 2 months against earlier ones', () => {
    const s = [mes('1', { cycleTimeDias: 4 }), mes('2', { cycleTimeDias: 4 }), mes('3', { cycleTimeDias: 7 }), mes('4', { cycleTimeDias: 8 })];
    expect(chaves(base({ meses: s }))).toContain('cycle_time');
    expect(chaves(base({ meses: [s[0], s[1], s[3], mes('5', { cycleTimeDias: 4 })] }))).not.toContain('cycle_time');
  });

  it('flags MTTR above 1.5x the mean of the earlier months', () => {
    const meses = (ultimo: number) => [mes('1', { mttrDias: 6 }), mes('2', { mttrDias: 8 }), mes('3', { mttrDias: 7 }), mes('4', { mttrDias: ultimo }), mes('5', { encerrado: false })];
    expect(chaves(base({ meses: meses(11) }))).toContain('mttr'); // 11 > 7 x 1.5
    expect(chaves(base({ meses: meses(10) }))).not.toContain('mttr');
  });

  describe('bug rate windows', () => {
    const am = (bugs: number, userStoriesResolvidas: number) => ({ bugs, userStoriesResolvidas, taxa: Math.round((bugs / userStoriesResolvidas) * 1000) / 10 });
    const jan = (dias: number, atual: [number, number], anterior: [number, number]): JanelaBugRate => ({ dias, atual: am(...atual), anterior: am(...anterior) });
    const desc = (j: JanelaBugRate[]) => avaliarSinais(base({ bugRateJanelas: j }), AGORA, LIMITES_PADRAO).find((s) => s.chave === 'bug_rate_janela')?.descricao;

    it('alerts when the 7 or 30-day window rises and is above the limit', () => {
      expect(desc([jan(30, [31, 91], [20, 91]), jan(7, [9, 22], [5, 20])])).toBe('Bug rate subindo: 30 dias em 34.1% (era 22%) e 7 dias em 40.9% (era 25%) (limite 10%)');
      expect(desc([jan(30, [31, 91], [20, 91]), jan(7, [4, 22], [5, 20])])).toBe('Bug rate subindo: 30 dias em 34.1% (era 22%) (limite 10%)');
    });

    it('stays quiet when it is falling, under the limit, the sample is small, or only the 90-day window rises', () => {
      expect(desc([jan(30, [20, 91], [31, 91])])).toBeUndefined();
      expect(desc([jan(30, [8, 91], [5, 91])])).toBeUndefined(); // 8.8% is under 10%
      expect(desc([jan(7, [4, 9], [1, 12])])).toBeUndefined(); // only 9 User Stories resolved
      expect(desc([jan(7, [4, 12], [1, 9])])).toBeUndefined(); // only 9 in the previous window
      expect(desc([jan(90, [79, 272], [60, 270])])).toBeUndefined();
    });
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

describe('sinais ainda ativos são avisados de novo no dia seguinte', () => {
  const s = [{ chave: 'bloqueio', severidade: 'vermelho' as const, descricao: 'x' }];
  const manha = new Date('2026-10-21T11:00:00Z'); // Wed 08:00 in São Paulo

  it('does not repeat on the same day, repeats on the next, and stays quiet again after that notice', async () => {
    const db = await makeTestDb();
    atualizarSinais(db, 't', s, manha);
    expect(sinaisNaoAvisados(db, manha)).toHaveLength(1);
    marcarAvisado(db, 't', 'bloqueio', manha);
    expect(sinaisNaoAvisados(db, new Date('2026-10-21T19:00:00Z'))).toHaveLength(0); // Wed 16:00
    // São Paulo midnight, not UTC: 02:30 UTC on the 22nd is still the 21st in São Paulo
    expect(sinaisNaoAvisados(db, new Date('2026-10-22T02:30:00Z'))).toHaveLength(0);
    const quinta = new Date('2026-10-22T11:00:00Z');
    atualizarSinais(db, 't', s, quinta);
    expect(sinaisNaoAvisados(db, quinta)).toEqual([expect.objectContaining({ chave: 'bloqueio', desde: manha.toISOString() })]);
    marcarAvisado(db, 't', 'bloqueio', quinta);
    expect(sinaisNaoAvisados(db, new Date('2026-10-22T18:00:00Z'))).toHaveLength(0);
  });

  it('a resolved signal is not repeated', async () => {
    const db = await makeTestDb();
    atualizarSinais(db, 't', s, manha);
    marcarAvisado(db, 't', 'bloqueio', manha);
    atualizarSinais(db, 't', [], new Date('2026-10-22T11:00:00Z'));
    expect(sinaisNaoAvisados(db, new Date('2026-10-22T11:00:00Z'))).toHaveLength(0);
  });
});

describe('sinais resolvidos', () => {
  const sinal = [{ chave: 'bloqueio', severidade: 'vermelho' as const, descricao: 'x' }];
  const d1 = new Date('2026-10-19T08:00:00Z');
  const d2 = new Date('2026-10-21T08:00:00Z');

  it('gives one resolved notice for a signal that had been announced', async () => {
    const db = await makeTestDb();
    atualizarSinais(db, 't', sinal, d1);
    marcarAvisado(db, 't', 'bloqueio');
    atualizarSinais(db, 't', [], d2);
    const [r] = sinaisResolvidosNaoAvisados(db);
    expect(r).toMatchObject({ time: 't', chave: 'bloqueio', desde: d1.toISOString(), resolvidoEm: d2.toISOString() });
    marcarResolucaoAvisada(db, 't', 'bloqueio');
    expect(sinaisResolvidosNaoAvisados(db)).toHaveLength(0);
  });

  it('says nothing about a signal that was never announced, nor when it comes back before the notice', async () => {
    const db = await makeTestDb();
    atualizarSinais(db, 't', sinal, d1);
    atualizarSinais(db, 't', [], d2); // never announced
    expect(sinaisResolvidosNaoAvisados(db)).toHaveLength(0);
    atualizarSinais(db, 't', sinal, d1);
    marcarAvisado(db, 't', 'bloqueio');
    atualizarSinais(db, 't', [], d2);
    atualizarSinais(db, 't', sinal, d2); // back: a new signal, not a resolved one
    expect(sinaisResolvidosNaoAvisados(db)).toHaveLength(0);
    expect(sinaisNaoAvisados(db)).toHaveLength(1);
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
    expect(JSON.stringify(itensProblema(db, 'fiscal', 'sem_dono', AGORA))).not.toContain('ana@'); // the display name goes out, the e-mail does not
    expect(itensProblema(db, 'fiscal', 'bloqueados', AGORA)[0].responsavel).toBe('Ana Souza');
    expect(itensProblema(db, 'fiscal', 'sem_dono', AGORA).every((i) => i.responsavel === undefined)).toBe(true);
  });

  it('evaluates the team end to end and registers signals', () => {
    const r = avaliarTime(db, 'fiscal', AGORA);
    const k = r.sinais.ativos.map((s) => s.chave);
    expect(k).toEqual(expect.arrayContaining(['envelhecimento', 'bloqueio', 'bug_sem_dono']));
    expect(sinaisAtivos(db, 'fiscal').length).toBe(r.sinais.ativos.length);
  });
});
