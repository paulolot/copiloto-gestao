/**
 * T0.5 — Approval queue + autonomy policy tests
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { enqueue, updateQueueState, getPendingItems, getQueueItem } from '../../src/ponte/db/queue.js';
import { enforcePolicy } from '../../src/ponte/middleware/autonomy.js';
import { executeApproved } from '../../src/ponte/middleware/executor.js';
import { queryAudit } from '../../src/ponte/db/audit.js';

let db: Database;

beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      tool TEXT NOT NULL, params TEXT, origin TEXT,
      result TEXT NOT NULL, duration_ms INTEGER, error_msg TEXT, restricted_path TEXT
    );
    CREATE TABLE approval_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      tool TEXT NOT NULL, action TEXT NOT NULL, content TEXT,
      destination TEXT, reason TEXT, origin TEXT,
      state TEXT NOT NULL DEFAULT 'pendente', updated_at TEXT,
      edited_content TEXT, discord_msg_id TEXT
    );
  `);
});

describe('approval queue', () => {
  it('creates a pending item', () => {
    const id = enqueue(db, { tool: 'discord_postar', action: 'Postar em #cto', content: 'Olá' });
    expect(id).toBeGreaterThan(0);
    const item = getQueueItem(db, id);
    expect(item?.state).toBe('pendente');
    expect(item?.action).toBe('Postar em #cto');
  });

  it('lists pending items', () => {
    enqueue(db, { tool: 'vault_criar_nota', action: 'Criar nota de decisão' });
    enqueue(db, { tool: 'vault_criar_nota', action: 'Criar outra nota' });
    const pending = getPendingItems(db);
    expect(pending).toHaveLength(2);
  });

  it('updates state to aprovado', () => {
    const id = enqueue(db, { tool: 'discord_postar', action: 'teste' });
    updateQueueState(db, id, 'aprovado');
    const item = getQueueItem(db, id);
    expect(item?.state).toBe('aprovado');
  });

  it('approved item disappears from pending', () => {
    const id = enqueue(db, { tool: 'discord_postar', action: 'teste' });
    updateQueueState(db, id, 'aprovado');
    expect(getPendingItems(db)).toHaveLength(0);
  });
});

describe('autonomy policy', () => {
  it('sozinho: allows immediately', () => {
    const result = enforcePolicy(db, { tool: 'discord_postar', level: 'sozinho', action: 'postar' });
    expect(result.allowed).toBe(true);
  });

  it('pede_ok: queues and does NOT allow', () => {
    const result = enforcePolicy(db, { tool: 'vault_criar_nota', level: 'pede_ok', action: 'criar nota' });
    expect(result.allowed).toBe(false);
    expect('queued' in result && result.queued).toBe(true);
    if (!result.allowed && result.queued) {
      expect(result.queueId).toBeGreaterThan(0);
      const item = getQueueItem(db, result.queueId);
      expect(item?.state).toBe('pendente');
    }
  });

  it('nunca: never allows and logs error', () => {
    const result = enforcePolicy(db, { tool: 'tool_bloqueada', level: 'nunca', action: 'qualquer' });
    expect(result.allowed).toBe(false);
    expect('queued' in result && result.queued).toBe(false);
  });

  it('pede_ok tool never executes without approval', () => {
    // Simulate: enqueue → still pendente → not allowed
    const r = enforcePolicy(db, { tool: 'vault_criar_nota', level: 'pede_ok', action: 'create' });
    if (!r.allowed && r.queued) {
      const item = getQueueItem(db, r.queueId);
      expect(item?.state).toBe('pendente'); // never 'executado' without approval
    }
  });
});

describe('queue state machine', () => {
  it('rejects invalid transitions', () => {
    const id = enqueue(db, { tool: 'discord_postar', action: 'teste' });
    expect(() => updateQueueState(db, id, 'executado')).toThrow('Transição inválida');
    updateQueueState(db, id, 'recusado');
    expect(() => updateQueueState(db, id, 'aprovado')).toThrow('Transição inválida');
    expect(() => updateQueueState(db, 9999, 'aprovado')).toThrow('não existe');
  });
});

describe('executor', () => {
  it('only executes approved items', async () => {
    const calls: string[] = [];
    const handlers = { discord_postar: async (_i: unknown, c?: string) => { calls.push(c ?? ''); } };
    const pending = enqueue(db, { tool: 'discord_postar', action: 'a', content: 'pendente' });
    const refused = enqueue(db, { tool: 'discord_postar', action: 'b', content: 'recusado' });
    const approved = enqueue(db, { tool: 'discord_postar', action: 'c', content: 'aprovado' });
    const edited = enqueue(db, { tool: 'discord_postar', action: 'd', content: 'original' });
    updateQueueState(db, refused, 'recusado');
    updateQueueState(db, approved, 'aprovado');
    updateQueueState(db, edited, 'editado', { edited_content: 'editado' });

    expect(await executeApproved(db, handlers)).toBe(2);
    expect(calls).toEqual(['aprovado', 'editado']);
    expect(getQueueItem(db, pending)?.state).toBe('pendente');
    expect(getQueueItem(db, refused)?.state).toBe('recusado');
    expect(getQueueItem(db, approved)?.state).toBe('executado');
    expect(await executeApproved(db, handlers)).toBe(0); // never runs twice
  });

  it('keeps the item approved and logs the error when the handler fails', async () => {
    const id = enqueue(db, { tool: 'discord_postar', action: 'x' });
    updateQueueState(db, id, 'aprovado');
    await executeApproved(db, { discord_postar: async () => { throw new Error('falhou'); } });
    expect(getQueueItem(db, id)?.state).toBe('aprovado');
    expect(queryAudit(db)[0].result).toBe('error');
  });
});
