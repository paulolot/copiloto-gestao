/**
 * T1.2 — Sync tests
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { sincronizarTime } from '../../src/ponte/azure/sync.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

const fiscal = TIMES[0];
let db: Database;
const count = (t: string) => db.exec(`SELECT COUNT(*) FROM ${t}`)[0].values[0][0];

beforeEach(async () => {
  db = await makeTestDb();
});

describe('sincronizarTime', () => {
  it('does the initial load', async () => {
    const chamadas: { url: string; body?: string }[] = [];
    const client = new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch(chamadas) });
    const r = await sincronizarTime(db, client, fiscal, AGORA);
    expect(r).toMatchObject({ workItems: 7, incremental: false, commits: 5, pullRequests: 1 });
    expect(count('work_items')).toBe(7);
    expect(count('iteracoes')).toBe(2);
    expect(count('commits_dia')).toBe(5);
    expect(count('pull_requests')).toBe(1);
  });

  it('is incremental and idempotent on the second run', async () => {
    const chamadas: { url: string; body?: string }[] = [];
    const client = new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch(chamadas) });
    await sincronizarTime(db, client, fiscal, AGORA);
    chamadas.length = 0;
    const r = await sincronizarTime(db, client, fiscal, new Date(AGORA.getTime() + 3_600_000));
    expect(r.incremental).toBe(true);
    const query: string = JSON.parse(chamadas.find((c) => c.url.includes('/wiql'))!.body!).query;
    expect(query).not.toContain('NOT IN');
    expect(count('work_items')).toBe(7);
    expect(count('commits_dia')).toBe(5);
  });

  it('records the error and keeps the previous data when Azure DevOps fails', async () => {
    const ok = new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch() });
    await sincronizarTime(db, ok, fiscal, AGORA);
    const ruim = new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch([], { status: 503 }) });
    await expect(sincronizarTime(db, ruim, fiscal, AGORA)).rejects.toThrow('503');
    expect(db.exec('SELECT ultimo_erro, ultimo_sync FROM sync_estado')[0].values[0][0]).toContain('503');
    expect(count('work_items')).toBe(7);
  });
});
