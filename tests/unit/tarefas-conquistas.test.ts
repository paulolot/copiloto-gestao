/**
 * T1.7 / T1.8 — Tasks and achievements
 */
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'sql.js';
import { tarefaConcluir, tarefaCriar, tarefaListar } from '../../src/ponte/tools/tarefas.js';
import { conquistaRegistrar } from '../../src/ponte/tools/conquistas.js';
import { makeTestDb } from './helpers.js';

let db: Database;
beforeEach(async () => {
  db = await makeTestDb();
});

describe('tarefas', () => {
  it('runs the full cycle: create, list, complete', () => {
    const id = tarefaCriar(db, { titulo: 'Responder o CTO', prioridade: 'alta', origem: 'e-mail de 20/10', prazo: '2026-10-22' });
    expect(tarefaListar(db)).toEqual([expect.objectContaining({ id, titulo: 'Responder o CTO', prioridade: 'alta', origem: 'e-mail de 20/10', estado: 'aberta' })]);
    expect(tarefaConcluir(db, id).estado).toBe('feita');
    expect(tarefaListar(db)).toHaveLength(0);
    expect(tarefaListar(db, { incluirFeitas: true })).toHaveLength(1);
  });

  it('orders by priority, then due date, with undated last', () => {
    const b = tarefaCriar(db, { titulo: 'baixa', prioridade: 'baixa' });
    const m = tarefaCriar(db, { titulo: 'media sem prazo' });
    const a2 = tarefaCriar(db, { titulo: 'alta depois', prioridade: 'alta', prazo: '2026-11-01' });
    const a1 = tarefaCriar(db, { titulo: 'alta antes', prioridade: 'alta', prazo: '2026-10-25' });
    expect(tarefaListar(db).map((t) => t.id)).toEqual([a1, a2, m, b]);
  });

  it('rejects unknown ids, double completion and a malformed due date', () => {
    expect(() => tarefaConcluir(db, 99)).toThrow('não existe');
    const id = tarefaCriar(db, { titulo: 'x' });
    tarefaConcluir(db, id);
    expect(() => tarefaConcluir(db, id)).toThrow('já está concluída');
    expect(() => tarefaCriar(db, { titulo: 'y', prazo: '22/10' })).toThrow('AAAA-MM-DD');
  });
});

describe('conquistas', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'vault-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('creates a conquista note in inbox with team credit, source and revisado: false', () => {
    cpSync(join(process.cwd(), 'tests/fixtures/vault'), tmp, { recursive: true });
    process.env.VAULT_PATH = tmp;
    const caminho = conquistaRegistrar({
      titulo: 'Fechamos o módulo fiscal da NFC-e',
      descricao: '12 itens entregues na sprint 42.',
      times: ['Squad Fiscal'],
      fontes: ['Azure DevOps: Sprint 42, Squad Fiscal'],
    });
    expect(caminho).toMatch(/^inbox\/\d{4}-\d{2}-\d{2}-.+\.md$/);
    const nota = readFileSync(join(tmp, caminho), 'utf8');
    expect(nota).toContain('tipo: "conquista"');
    expect(nota).toContain('times: ["Squad Fiscal"]');
    expect(nota).toContain('revisado: false');
    expect(nota).toContain('**Crédito:** Squad Fiscal');
    expect(nota).toContain('Azure DevOps: Sprint 42');
  });

  it('requires a source', () => {
    expect(() => conquistaRegistrar({ titulo: 't', descricao: 'd', times: [], fontes: [] })).toThrow('fonte');
  });
});
