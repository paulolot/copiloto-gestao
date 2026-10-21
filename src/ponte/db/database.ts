/**
 * Database layer — sql.js (SQLite in WASM, no native build).
 * The database lives in memory and is flushed to DB_PATH after every write (see persist),
 * so the audit log and the approval queue survive restarts.
 */
import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';

let _db: Database | null = null;
const _paths = new WeakMap<Database, string>();

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
  if (dbPath) _paths.set(_db, dbPath);
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

/** Writes the database to its file, atomically. No-op for databases opened without a path. */
export function persist(db: Database): void {
  const dbPath = _paths.get(db);
  if (!dbPath) return;
  const tmp = `${dbPath}.tmp`;
  writeFileSync(tmp, Buffer.from(db.export()));
  renameSync(tmp, dbPath);
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
