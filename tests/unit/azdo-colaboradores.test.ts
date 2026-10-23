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
import { pessoaPerfil } from '../../src/ponte/tools/pessoa-perfil.js';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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

  it('finds a person by display name, in any accent/case and with extra middle names', () => {
    for (const q of ['Ana Souza', 'ana souza', 'ANA', 'Souza Ana', 'Ana Maria Souza']) {
      const n = metricasColaboradores(db, { timeIds: ['fiscal'], pessoa: q, agora: AGORA }).colaboradores.length;
      expect([q, n]).toEqual([q, q === 'Ana Maria Souza' ? 0 : 1]); // every word must appear: "Maria" does not
    }
    expect(metricasColaboradores(db, { timeIds: ['fiscal'], pessoa: 'Souza Silva', agora: AGORA }).colaboradores).toHaveLength(0);
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

describe('pessoa_perfil board signals', () => {
  const comPerfil = (campos: string, fn: () => void) => {
    const raiz = mkdtempSync(join(tmpdir(), 'vault-board-'));
    process.env.VAULT_PATH = raiz;
    mkdirSync(join(raiz, 'pessoas/aninha'), { recursive: true });
    writeFileSync(join(raiz, 'pessoas/aninha/perfil.md'), `---\ntipo: perfil\npessoa: "Aninha"\ntime: "Squad Fiscal"\n${campos}---\n`);
    try { fn(); } finally { rmSync(raiz, { recursive: true, force: true }); }
  };
  const abertos = (p: ReturnType<typeof pessoaPerfil>) => (p.board as { colaboradores: { abertos: number }[] } | null)?.colaboradores[0].abertos;

  it('falls back to the e-mail when azure_devops_id does not match, and ignores [AJUSTAR] placeholders', () => {
    comPerfil('azure_devops_id: "nome que nao existe"\nemail: "ana@empresa.com"\n', () => expect(abertos(pessoaPerfil(db, 'Aninha', AGORA))).toBe(3));
    comPerfil('azure_devops_id: "[AJUSTAR]"\nemail: "ana@empresa.com"\n', () => expect(abertos(pessoaPerfil(db, 'Aninha', AGORA))).toBe(3));
  });

  it('says what to fix when no identifier matches', () => {
    comPerfil('email: "outra@imex.com.br"\n', () => {
      const p = pessoaPerfil(db, 'Aninha', AGORA);
      expect(p.board).toBeNull();
      expect(p.avisos.join(' ')).toContain('azure_devops_id');
    });
  });

  it('uses the azure_devops_id of the profile, so the name Paulo uses does not have to match the board', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'vault-board-'));
    process.env.VAULT_PATH = raiz;
    mkdirSync(join(raiz, 'pessoas/aninha'), { recursive: true });
    writeFileSync(join(raiz, 'pessoas/aninha/perfil.md'), '---\ntipo: perfil\npessoa: "Aninha"\ntime: "Squad Fiscal"\nazure_devops_id: "Ana Souza"\n---\n');
    try {
      const p = pessoaPerfil(db, 'Aninha', AGORA);
      expect((p.board as { colaboradores: { abertos: number }[] }).colaboradores[0].abertos).toBe(3);
      expect(p.avisos.join(' ')).not.toContain('Board indisponível');
    } finally { rmSync(raiz, { recursive: true, force: true }); }
  });
});
