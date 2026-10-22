/**
 * Per-collaborator metrics
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { sincronizarTime } from '../../src/ponte/azure/sync.js';
import { metricasColaboradores } from '../../src/ponte/azure/metricas-pessoa.js';
import { metricasColaborador } from '../../src/ponte/tools/boards.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

let db: Database;
beforeAll(async () => {
  db = await makeTestDb();
  await sincronizarTime(db, new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() }), TIMES[0], AGORA);
});

describe('metricasColaboradores', () => {
  it('computes the numbers of one person', () => {
    const r = metricasColaboradores(db, { timeIds: ['fiscal'], pessoa: 'ANA@', agora: AGORA });
    expect(r.colaboradores).toHaveLength(1);
    const ana = r.colaboradores[0];
    expect(ana).toMatchObject({
      colaborador: 'ana@empresa.com', times: ['fiscal'], abertos: 3, emAndamento: 3, wipAcimaDoLimite: false,
      envelhecendo: 1, paralisados: 1, bugsAbertos: 0, entregues28Dias: 2, pontosEntregues28Dias: 6,
    });
    expect(ana.leadTimeDias).toBe(5);
    expect(ana.entreguesPorSemana).toHaveLength(8);
    expect(ana.itensAbertos[0].id).toBe(1); // oldest in state first
  });

  it('excludes items without owner and ignores people who do not match', () => {
    expect(metricasColaboradores(db, { timeIds: ['fiscal'], pessoa: 'joao', agora: AGORA }).colaboradores).toHaveLength(0);
    expect(metricasColaboradores(db, { timeIds: ['fiscal'], agora: AGORA }).colaboradores.map((c) => c.colaborador)).toEqual(['ana@empresa.com']);
  });

  it('carries the usage warning and has no score or ranking field', () => {
    const r = metricasColaboradores(db, { timeIds: ['fiscal'], agora: AGORA });
    expect(r.uso).toContain('Não ranquear');
    expect(JSON.stringify(r)).not.toMatch(/rank|score|posicao/i);
  });

  it('the tool errors when nobody matches', () => {
    expect(() => metricasColaborador(db, { pessoa: 'ninguem' }, AGORA)).toThrow('Nenhum colaborador');
  });
});
