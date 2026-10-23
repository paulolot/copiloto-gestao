/**
 * T1.6 — Scheduler: window, new-signals-only posting, failure reporting
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import type { Database } from 'sql.js';
import { AzdoClient } from '../../src/ponte/azure/client.js';
import { TIMES } from '../../src/ponte/azure/escopo.js';
import { dentroDaJanela, executarCiclo, formatarResolucao, formatarSinal } from '../../src/ponte/agendador.js';
import { atualizarSinais, itensDoSinal } from '../../src/ponte/azure/alertas.js';
import { LIMITES_PADRAO } from '../../src/ponte/azure/metricas.js';
import { queryAudit } from '../../src/ponte/db/audit.js';
import { AGORA, fakeFetch } from '../fixtures/azdo/respostas.js';
import { makeTestDb } from './helpers.js';

let db: Database;
const posts: { canal: string; texto: string }[] = [];
const postar = async (canal: string, texto: string) => void posts.push({ canal, texto });
const client = (status?: number) => new AzdoClient({ org: 'o', pat: 'p', fetch: fakeFetch([], { status }) });

beforeEach(async () => {
  db = await makeTestDb();
  posts.length = 0;
});

describe('dentroDaJanela', () => {
  it('is true on weekdays between 7h and 17h in São Paulo', () => {
    expect(dentroDaJanela(new Date('2026-10-21T10:00:00Z'))).toBe(true);  // Wed 07:00
    expect(dentroDaJanela(new Date('2026-10-21T09:59:00Z'))).toBe(false); // Wed 06:59
    expect(dentroDaJanela(new Date('2026-10-21T19:59:00Z'))).toBe(true);  // Wed 16:59
    expect(dentroDaJanela(new Date('2026-10-21T20:00:00Z'))).toBe(false); // Wed 17:00
    expect(dentroDaJanela(new Date('2026-10-24T15:00:00Z'))).toBe(false); // Sat
  });
});

describe('executarCiclo', () => {
  it('posts new signals to #alertas once, and not again on the next cycle', async () => {
    const r1 = await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: AGORA });
    expect(r1.sincronizados).toEqual(['fiscal']);
    expect(r1.alertasPostados).toBeGreaterThan(0);
    expect(posts.every((p) => p.canal === 'alertas')).toBe(true);
    expect(posts.some((p) => p.texto.includes('Squad Fiscal') && p.texto.includes('Azure DevOps'))).toBe(true);

    posts.length = 0;
    const r2 = await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: new Date(AGORA.getTime() + 3_600_000) });
    expect(r2.alertasPostados).toBe(0);
    expect(posts).toHaveLength(0);
  });

  it('announces a signal that is still active again on the next day, once', async () => {
    await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: AGORA });
    posts.length = 0;
    const amanha = new Date(AGORA.getTime() + 86_400_000);
    const r2 = await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: amanha });
    expect(r2.alertasPostados).toBeGreaterThan(0);
    expect(posts.every((p) => p.canal === 'alertas')).toBe(true);
    posts.length = 0;
    const r3 = await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: new Date(amanha.getTime() + 3_600_000) });
    expect(r3.alertasPostados).toBe(0);
  });

  it('keeps a signal unannounced when Discord fails, and retries next cycle', async () => {
    const falha = async () => { throw new Error('discord fora'); };
    const r1 = await executarCiclo({ db, azdo: client(), postar: falha, times: [TIMES[0]], agora: AGORA });
    expect(r1.alertasPostados).toBe(0);
    const r2 = await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: AGORA });
    expect(r2.alertasPostados).toBeGreaterThan(0);
  });

  it('reports a sync failure once per distinct error and logs it', async () => {
    const r1 = await executarCiclo({ db, azdo: client(503), postar, times: [TIMES[0]], agora: AGORA });
    expect(r1.falhas).toEqual(['fiscal']);
    expect(posts).toHaveLength(1);
    expect(posts[0].texto).toContain('503');
    await executarCiclo({ db, azdo: client(503), postar, times: [TIMES[0]], agora: AGORA });
    expect(posts).toHaveLength(1);
    expect(queryAudit(db).filter((a) => a.tool === 'boards_sync_agendado' && a.result === 'error')).toHaveLength(2);
  });

  it('formats a signal with severity, team and first-seen date', () => {
    const t = formatarSinal('Squad Fiscal', { time: 'fiscal', chave: 'k', descricao: 'algo', severidade: 'vermelho', desde: '2026-10-19T15:00:00Z' });
    expect(t).toBe('🔴 **Squad Fiscal** — algo (desde 19/10) · fonte: Azure DevOps');
  });

  it('lists the items behind each signal with a link, and the owner only when asked', async () => {
    await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: AGORA, org: 'minhaorg' });
    const aviso = posts.find((p) => p.texto.includes('sem mudança de estado'))!.texto;
    expect(aviso).toContain('[#1](<https://dev.azure.com/minhaorg/Metanet/_workitems/edit/1>) Item 1');
    expect(aviso).not.toContain('Ana');
    expect(posts.find((p) => p.texto.includes('sem dono'))!.texto).toContain('#6');

    const db2 = await makeTestDb();
    const posts2: string[] = [];
    await executarCiclo({ db: db2, azdo: client(), postar: async (_c, t) => void posts2.push(t), times: [TIMES[0]], agora: AGORA, org: 'minhaorg', comResponsavel: true });
    expect(posts2.find((t) => t.includes('sem mudança de estado'))).toContain('Item 1 — Ana Souza');
  });

  it('names who is over the WIP limit only when asked', async () => {
    await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: AGORA });
    const lim = { ...LIMITES_PADRAO, wipPorPessoa: 2 };
    expect(itensDoSinal(db, 'fiscal', 'wip_pessoa', AGORA, true, lim).resumo).toBe('Ana Souza: #1, #2, #7');
    expect(itensDoSinal(db, 'fiscal', 'wip_pessoa', AGORA, false, lim).resumo).toBeUndefined();
  });

  it('caps the item list in a signal message', () => {
    const itens = Array.from({ length: 12 }, (_, n) => ({ id: n + 1, tipo: 'Bug', titulo: `Bug ${n + 1}`, dias: 3 }));
    const t = formatarSinal('Squad Fiscal', { time: 'fiscal', chave: 'k', descricao: 'algo', severidade: 'amarelo', desde: '2026-10-19T15:00:00Z' }, { itens });
    expect(t.split('\n')).toHaveLength(1 + 8 + 1);
    expect(t).toContain('e mais 4');
  });

  it('posts a resolved notice once when an announced signal stops holding', async () => {
    await executarCiclo({ db, azdo: client(), postar, times: [TIMES[0]], agora: AGORA });
    posts.length = 0;
    atualizarSinais(db, 'fiscal', [], new Date(AGORA.getTime() + 3_600_000)); // every Fiscal signal stops holding
    await executarCiclo({ db, azdo: client(503), postar, times: [TIMES[0]], agora: new Date(AGORA.getTime() + 3_600_000) });
    const resolvidos = posts.filter((p) => p.texto.startsWith('✅'));
    expect(resolvidos.length).toBeGreaterThan(0);
    expect(resolvidos[0].texto).toContain('resolvido em');
    posts.length = 0;
    await executarCiclo({ db, azdo: client(503), postar, times: [TIMES[0]], agora: new Date(AGORA.getTime() + 7_200_000) });
    expect(posts.filter((p) => p.texto.startsWith('✅'))).toHaveLength(0);
  });

  it('formats a resolved notice', () => {
    const t = formatarResolucao('Squad Fiscal', { time: 'fiscal', chave: 'k', descricao: 'algo', severidade: 'vermelho', desde: '2026-10-19T15:00:00Z', resolvidoEm: '2026-10-22T15:00:00Z' });
    expect(t).toBe('✅ **Squad Fiscal** — resolvido: algo (ativo desde 19/10, resolvido em 22/10) · fonte: Azure DevOps');
  });
});
