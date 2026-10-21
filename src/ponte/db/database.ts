/**
 * Database layer — wraps sql.js (dev/cloud) or better-sqlite3 (production).
 * In production on Paulo's machine, replace sql.js with better-sqlite3 for persistence.
 */
import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, existsSync } from 'fs';

let _db: Database | null = null;

export async function getDb(dbPath?: string): Promise<Database> {
  if (_db) return _db;

  const SQL = await initSqlJs();

  if (dbPath && existsSync(dbPath)) {
    const buf = readFileSync(dbPath);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  initSchema(_db);
  return _db;
}

function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ts        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      tool      TEXT    NOT NULL,
      params    TEXT,          -- JSON, sem segredos
      origin    TEXT,
      result    TEXT    NOT NULL CHECK(result IN ('ok','error')),
      duration_ms INTEGER,
      error_msg TEXT,
      restricted_path TEXT     -- caminho da nota restrita (nunca o conteúdo)
    );

    CREATE TABLE IF NOT EXISTS approval_queue (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      tool        TEXT    NOT NULL,
      action      TEXT    NOT NULL,
      content     TEXT,
      destination TEXT,
      reason      TEXT,
      origin      TEXT,
      state       TEXT    NOT NULL DEFAULT 'pendente'
                          CHECK(state IN ('pendente','aprovado','editado','recusado','executado')),
      updated_at  TEXT,
      edited_content TEXT,
      discord_msg_id TEXT
    );
  `);
}

/** Persiste o banco em arquivo (para usar na máquina do Paulo com better-sqlite3 instalado) */
export function saveDb(db: Database, dbPath: string): void {
  const { writeFileSync } = require('fs');
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
