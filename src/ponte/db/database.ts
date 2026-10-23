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
      dono TEXT,          -- só para WIP agregado; nenhuma ferramenta devolve este campo
      dono_nome TEXT      -- nome de exibição; só aparece em #alertas se ALERTAS_COM_RESPONSAVEL estiver ligado
    );
    CREATE INDEX IF NOT EXISTS idx_wi_time ON work_items(time_id, estado);

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
      periodo TEXT NOT NULL,   -- 'semana:2026-W43' ou 'mes:2026-10'
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
      avisado_dia TEXT,                           -- AAAA-MM-DD (São Paulo) do último aviso; um sinal ainda ativo é avisado de novo no dia seguinte
      resolvido_em TEXT,                          -- quando o sinal deixou de valer (só se ele tinha sido avisado)
      resolucao_avisada INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (time_id, chave)
    );

    -- Marcos de entrega: uma data combinada + os work items marcados com uma tag (a tag é arbitrária,
    -- por isso o marco é registrado aqui). 'planejado' = regras do próximo marco já definidas, ainda sem tag ou data.
    CREATE TABLE IF NOT EXISTS marcos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tag TEXT,
      time_id TEXT,                  -- NULL = todos os times ativos
      data TEXT,                     -- AAAA-MM-DD, data atual combinada
      data_original TEXT,
      adiamentos INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'planejado' CHECK(estado IN ('planejado','ativo','entregue','cancelado')),
      -- regras do marco, definidas pelo Paulo quando quiser
      confianca INTEGER NOT NULL DEFAULT 85,        -- nível de confiança exigido da previsão (percentil)
      janela_semanas INTEGER NOT NULL DEFAULT 12,   -- semanas de histórico usadas na previsão
      tipos TEXT,                                   -- tipos de item contados (padrão: os do ambiente)
      escopo_fechado INTEGER NOT NULL DEFAULT 0,    -- 1 = avisar se entrarem itens depois do registro
      escopo_inicial INTEGER,                       -- itens com a tag quando o marco foi ativado
      observacao TEXT,                              -- regras em texto livre, mostradas junto ao marco
      criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      atualizado_em TEXT
    );

    -- Até onde as mensagens de um canal de conversa já foram lidas pelo Copiloto
    CREATE TABLE IF NOT EXISTS discord_cursor (
      canal TEXT PRIMARY KEY,
      ultimo_id TEXT NOT NULL,
      atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS tarefas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      prioridade TEXT NOT NULL DEFAULT 'media' CHECK(prioridade IN ('alta','media','baixa')),
      origem TEXT,
      prazo TEXT,
      estado TEXT NOT NULL DEFAULT 'aberta' CHECK(estado IN ('aberta','feita')),
      criada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      concluida_em TEXT,
      cobrar_de TEXT,      -- quem deve algo ao Paulo (tarefa de cobrança)
      lembrar_em TEXT      -- AAAA-MM-DD em que o Paulo quer ser lembrado de cobrar
    );

    -- Reuniões recorrentes que o Paulo cadastra no Discord e que o Copiloto prepara antes de acontecerem
    CREATE TABLE IF NOT EXISTS reunioes_recorrentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,           -- título do evento no Google Calendar
      dia_semana INTEGER NOT NULL CHECK(dia_semana BETWEEN 0 AND 6), -- 0 domingo ... 6 sábado
      hora TEXT NOT NULL,             -- HH:MM
      frequencia TEXT NOT NULL DEFAULT 'semanal' CHECK(frequencia IN ('semanal','quinzenal')),
      inicio TEXT NOT NULL,           -- AAAA-MM-DD de uma ocorrência (referência da quinzena)
      assunto TEXT NOT NULL,          -- para que serve a reunião
      participantes TEXT,
      times TEXT,
      marco TEXT,
      fontes TEXT,                    -- planilhas, documentos, links que acompanham a reunião
      instrucoes TEXT,                -- como o Paulo quer a pauta
      preparada_em TEXT,              -- AAAA-MM-DD da última ocorrência já preparada
      criada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
}

/** Adds columns introduced after the first release to databases created before them. */
function migrate(db: Database): void {
  const cols = (db.exec('PRAGMA table_info(work_items)')[0]?.values ?? []).map((v) => v[1] as string);
  if (!cols.includes('paralisado')) db.run('ALTER TABLE work_items ADD COLUMN paralisado INTEGER NOT NULL DEFAULT 0');
  const colsTarefas = (db.exec('PRAGMA table_info(tarefas)')[0]?.values ?? []).map((v) => v[1] as string);
  if (!colsTarefas.includes('cobrar_de')) db.run('ALTER TABLE tarefas ADD COLUMN cobrar_de TEXT');
  if (!colsTarefas.includes('lembrar_em')) db.run('ALTER TABLE tarefas ADD COLUMN lembrar_em TEXT');
  if (!cols.includes('coluna')) db.run('ALTER TABLE work_items ADD COLUMN coluna TEXT');
  for (const c of ['backlog_em', 'pronto_em', 'marcos_em']) if (!cols.includes(c)) db.run(`ALTER TABLE work_items ADD COLUMN ${c} TEXT`);
  if (!cols.includes('analise_em')) db.run('ALTER TABLE work_items ADD COLUMN analise_em TEXT');
  if (!cols.includes('tipo_bug')) db.run('ALTER TABLE work_items ADD COLUMN tipo_bug TEXT');
  const colsSinais = (db.exec('PRAGMA table_info(sinais)')[0]?.values ?? []).map((v) => v[1] as string);
  if (colsSinais.length && !colsSinais.includes('resolvido_em')) {
    db.run('ALTER TABLE sinais ADD COLUMN resolvido_em TEXT');
    db.run('ALTER TABLE sinais ADD COLUMN resolucao_avisada INTEGER NOT NULL DEFAULT 0');
  }
  if (colsSinais.length && !colsSinais.includes('avisado_dia')) {
    db.run('ALTER TABLE sinais ADD COLUMN avisado_dia TEXT');
    // What was announced before this column existed counts as announced today: the first repeat comes tomorrow, not all at once.
    db.run("UPDATE sinais SET avisado_dia = strftime('%Y-%m-%d', 'now', '-3 hours') WHERE avisado = 1");
  }
  if (!cols.includes('dono_nome')) {
    db.run('ALTER TABLE work_items ADD COLUMN dono_nome TEXT');
    // The names only arrive with a fetch: force a full load on the next sync so the items already stored get one.
    if (db.exec("SELECT name FROM sqlite_master WHERE name = 'sync_estado'")[0]) db.run('UPDATE sync_estado SET ultimo_sync = NULL');
  }
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
