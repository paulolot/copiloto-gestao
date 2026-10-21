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
  migrate(_db);
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

    -- Fase 1: boards, código, métricas, sinais e tarefas
    CREATE TABLE IF NOT EXISTS work_items (
      id INTEGER PRIMARY KEY,
      time_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      estado TEXT NOT NULL,
      titulo TEXT,
      iteration_path TEXT,
      criado_em TEXT,
      alterado_em TEXT,
      mudanca_estado_em TEXT,
      ativado_em TEXT,
      fechado_em TEXT,
      pontos REAL,
      tags TEXT,
      tem_dono INTEGER NOT NULL DEFAULT 0,
      paralisado INTEGER NOT NULL DEFAULT 0,
      tipo_bug TEXT,
      coluna TEXT,
      -- Marcos vindos das revisões do item (1ª vez em cada ponto); marcos_em = quando foram buscados
      backlog_em TEXT,    -- Backlog ou depois: início do lead time
      analise_em TEXT,    -- Fazendo Análise ou depois: início do cycle time
      pronto_em TEXT,     -- Pronto pra release ou depois (ou estado Resolved): fim do cycle time
      marcos_em TEXT,
      dono TEXT           -- só para WIP agregado; nenhuma ferramenta devolve este campo
    );
    CREATE INDEX IF NOT EXISTS idx_wi_time ON work_items(time_id, estado);

    CREATE TABLE IF NOT EXISTS iteracoes (
      time_id TEXT NOT NULL,
      caminho TEXT NOT NULL,
      nome TEXT NOT NULL,
      inicio TEXT,
      fim TEXT,
      PRIMARY KEY (time_id, caminho)
    );

    CREATE TABLE IF NOT EXISTS commits_dia (
      time_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      dia TEXT NOT NULL,
      qtd INTEGER NOT NULL,
      PRIMARY KEY (time_id, repo, dia)
    );

    CREATE TABLE IF NOT EXISTS pull_requests (
      time_id TEXT NOT NULL,
      repo TEXT NOT NULL,
      id INTEGER NOT NULL,
      estado TEXT,
      criado_em TEXT,
      fechado_em TEXT,
      PRIMARY KEY (time_id, repo, id)
    );

    CREATE TABLE IF NOT EXISTS sync_estado (
      time_id TEXT PRIMARY KEY,
      ultimo_sync TEXT,
      ultimo_erro TEXT
    );

    CREATE TABLE IF NOT EXISTS metric_snapshots (
      time_id TEXT NOT NULL,
      periodo TEXT NOT NULL,   -- 'semana:2026-W43' ou 'sprint:<caminho>'
      metrica TEXT NOT NULL,
      valor REAL,
      calculado_em TEXT NOT NULL,
      PRIMARY KEY (time_id, periodo, metrica)
    );

    CREATE TABLE IF NOT EXISTS sinais (
      time_id TEXT NOT NULL,
      chave TEXT NOT NULL,
      descricao TEXT NOT NULL,
      severidade TEXT NOT NULL,
      desde TEXT NOT NULL,
      ultimo_visto TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      avisado INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (time_id, chave)
    );

    CREATE TABLE IF NOT EXISTS tarefas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      prioridade TEXT NOT NULL DEFAULT 'media' CHECK(prioridade IN ('alta','media','baixa')),
      origem TEXT,
      prazo TEXT,
      estado TEXT NOT NULL DEFAULT 'aberta' CHECK(estado IN ('aberta','feita')),
      criada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      concluida_em TEXT
    );
  `);
}

/** Adds columns introduced after the first release to databases created before them. */
function migrate(db: Database): void {
  const cols = (db.exec('PRAGMA table_info(work_items)')[0]?.values ?? []).map((v) => v[1] as string);
  if (!cols.includes('paralisado')) db.run('ALTER TABLE work_items ADD COLUMN paralisado INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('coluna')) db.run('ALTER TABLE work_items ADD COLUMN coluna TEXT');
  for (const c of ['backlog_em', 'pronto_em', 'marcos_em']) if (!cols.includes(c)) db.run(`ALTER TABLE work_items ADD COLUMN ${c} TEXT`);
  if (!cols.includes('analise_em')) db.run('ALTER TABLE work_items ADD COLUMN analise_em TEXT');
  if (!cols.includes('tipo_bug')) db.run('ALTER TABLE work_items ADD COLUMN tipo_bug TEXT');
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
