/**
 * T0.4 — Audit log tests
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { logAudit, queryAudit } from '../../src/ponte/db/audit.js';

let db: Database;

beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      tool TEXT NOT NULL,
      params TEXT,
      origin TEXT,
      result TEXT NOT NULL,
      duration_ms INTEGER,
      error_msg TEXT,
      restricted_path TEXT
    )
  `);
});

describe('audit log', () => {
  it('records a successful call', () => {
    logAudit(db, { tool: 'ping', result: 'ok', duration_ms: 5 });
    const rows = queryAudit(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].tool).toBe('ping');
    expect(rows[0].result).toBe('ok');
  });

  it('records an error call with message', () => {
    logAudit(db, { tool: 'vault_ler', result: 'error', error_msg: 'Not found' });
    const rows = queryAudit(db);
    expect(rows[0].error_msg).toBe('Not found');
  });

  it('redacts secret params', () => {
    logAudit(db, {
      tool: 'vault_ler',
      params: { token: 'abc123', caminho: 'inbox/note.md' },
      result: 'ok',
    });
    const rows = queryAudit(db);
    const params = JSON.parse(rows[0].params as unknown as string);
    expect(params.token).toBe('[REDACTED]');
    expect(params.caminho).toBe('inbox/note.md');
  });

  it('logs restricted path without content', () => {
    logAudit(db, {
      tool: 'vault_ler',
      result: 'ok',
      restricted_path: 'pessoas/joao.md',
    });
    const rows = queryAudit(db);
    expect(rows[0].restricted_path).toBe('pessoas/joao.md');
  });
});
