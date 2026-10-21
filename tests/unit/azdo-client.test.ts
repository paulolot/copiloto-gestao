/**
 * T1.1 — Azure DevOps client tests (simulated responses)
 */
import { describe, it, expect } from '@jest/globals';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { fakeFetch } from '../fixtures/azdo/respostas.js';

const PAT = 'pat-super-secreto-123';
const make = (chamadas: { url: string; body?: string; auth?: string }[] = [], status?: number) =>
  new AzdoClient({ org: 'metanetsistema', pat: PAT, fetch: fakeFetch(chamadas, { status }) });

describe('AzdoClient', () => {
  it('requires a PAT and an organization', () => {
    expect(() => new AzdoClient({ org: 'x', pat: '' })).toThrow('AZDO_PAT');
    expect(() => new AzdoClient({ org: '', pat: 'x' })).toThrow('AZDO_ORG');
  });

  it('authenticates with Basic and the PAT only in the header', async () => {
    const chamadas: { url: string; auth?: string }[] = [];
    await make(chamadas).iteracoes('Metanet');
    expect(chamadas[0].auth).toBe('Basic ' + Buffer.from(`:${PAT}`).toString('base64'));
    expect(chamadas[0].url).not.toContain(PAT);
  });

  it('queries ids with WIQL scoped to the area path', async () => {
    const chamadas: { url: string; body?: string }[] = [];
    const ids = await make(chamadas).consultarIds('Metanet', "Metanet\\Squad Fiscal", { desde: '2026-07-01' });
    expect(ids).toHaveLength(8);
    const query: string = JSON.parse(chamadas[0].body!).query;
    expect(query).toContain("UNDER 'Metanet\\Squad Fiscal'");
    expect(query).toContain('2026-07-01');
  });

  it('normalizes work items and hides nothing needed for metrics', async () => {
    const itens = await make().workItems([2, 3]);
    const bloqueado = itens.find((i) => i.id === 2)!;
    expect(bloqueado.paralisado).toBe(true);
    expect(itens.find((i) => i.id === 3)!.paralisado).toBe(false);
    expect(bloqueado.temDono).toBe(true);
    const semDono = itens.find((i) => i.id === 3)!;
    expect(semDono.temDono).toBe(false);
    expect(semDono.pontos).toBeUndefined();
  });

  it('batches work items in groups of 200', async () => {
    const chamadas: { url: string; body?: string }[] = [];
    await make(chamadas).workItems(Array.from({ length: 450 }, (_, i) => i + 1));
    expect(chamadas).toHaveLength(3);
  });

  it('flattens iterations with their dates', async () => {
    const it = await make().iteracoes('Metanet');
    expect(it.map((i) => i.caminho)).toEqual(['Metanet\\Sprint 41', 'Metanet\\Sprint 42']);
  });

  it('reads commits and pull requests', async () => {
    const c = make();
    expect(await c.commits('Metanet', 'repo', '2026-09-01')).toHaveLength(5);
    expect((await c.pullRequests('Metanet', 'repo'))[0].estado).toBe('completed');
  });

  it('errors without leaking the token or the response body', async () => {
    const chamadas: { url: string }[] = [];
    const err = await make(chamadas, 401).iteracoes('Metanet').catch((e: Error) => e);
    expect((err as Error).message).toContain('401');
    expect((err as Error).message).not.toContain(PAT);
    expect((err as Error).message).not.toContain('segredo');
  });
});

describe('campos personalizados', () => {
  it('reads Paralisado and Tipo Bug, with configurable reference names', async () => {
    const { normalizarWorkItem, ehVerdadeiro } = await import('../../src/ponte/azure/client.js');
    const w = normalizarWorkItem({ id: 1, fields: { 'Meu.Par': true, 'Meu.Tipo': 'Bug Externo' } }, { paralisado: 'Meu.Par', tipoBug: 'Meu.Tipo' });
    expect(w.paralisado).toBe(true);
    expect(w.tipoBug).toBe('Bug Externo');
    expect([true, 'Sim', 'yes', 'Paralisado'].map(ehVerdadeiro)).toEqual([true, true, true, true]);
    expect([false, 'Não', 'nao', '', undefined, 'False'].map(ehVerdadeiro)).toEqual([false, false, false, false, false, false]);
  });
});
