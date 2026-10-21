/**
 * Roadmap progress by tag
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { sincronizarTime } from '../../src/ponte/azure/sync.js';
import { prefixoRoadmap, roadmaps } from '../../src/ponte/azure/roadmap.js';
import { boardsRoadmap } from '../../src/ponte/tools/boards.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

let db: Database;
beforeAll(async () => {
  db = await makeTestDb();
  await sincronizarTime(db, new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() }), TIMES[0], AGORA);
  // tag the items the way the team does it (any tag that starts with "roadmap")
  db.run(`UPDATE work_items SET tags = 'Roadmap-Fiscal-2026Q4' WHERE id IN (1, 2, 4)`);
  db.run(`UPDATE work_items SET tags = 'roadmap-fiscal-2026q4; outra' WHERE id = 3`);
  db.run(`UPDATE work_items SET tags = 'Roadmap-NFSe', coluna = 'Pronto pra release', estado = 'Resolved' WHERE id = 7`);
  db.run(`UPDATE work_items SET tags = 'Roadmap-Ideia' WHERE id = 8`); // in Ideias: out of every metric
});

describe('roadmaps', () => {
  it('groups by tag, ignoring tags that do not start with the prefix and items in Ideias', () => {
    const r = roadmaps(db, 'fiscal', { agora: AGORA });
    expect(r.map((x) => x.tag)).toEqual(['Roadmap-Fiscal-2026Q4', 'Roadmap-NFSe']); // tags that differ only by case are one roadmap;
  });

  it('measures the progress of one roadmap', () => {
    const [q4] = roadmaps(db, 'fiscal', { agora: AGORA, tag: 'ROADMAP-FISCAL-2026Q4' });
    expect(q4).toMatchObject({ total: 4, entregues: 1, emAndamento: 3, naoIniciados: 0, aguardandoRelease: 0, percentualEntregue: 25 });
    expect(q4.paralisados.map((i) => i.id)).toEqual([2]);
    expect(q4.parados.map((i) => i.id)).toEqual([1]); // item 1 has had no change for 12 days; item 2 for 5
  });

  it('separates what waits for release', () => {
    const [nfse] = roadmaps(db, 'fiscal', { agora: AGORA, tag: 'Roadmap-NFSe' });
    expect(nfse).toMatchObject({ total: 1, entregues: 0, aguardandoRelease: 1, emAndamento: 0 });
  });

  it('uses the configured prefix and warns when no item has a roadmap tag', () => {
    expect(prefixoRoadmap({ AZDO_TAG_ROADMAP: 'Épico ' } as NodeJS.ProcessEnv)).toBe('epico');
    expect(roadmaps(db, 'fiscal', { agora: AGORA, prefixo: 'epico' })).toEqual([]);
    const r = JSON.parse(boardsRoadmap(db, { time: 'fiscal' }, AGORA))[0];
    expect(r.roadmaps).toHaveLength(2);
    expect(r.fonte.areaPath).toBe('Metanet\\Squad Fiscal');
  });
});
