/**
 * T0.5 — Approval queue
 * Write tools never act directly — they create a queue item and wait for Paulo's OK on Discord.
 */
import type { Database } from 'sql.js';
import { persist } from './database.js';

export type ApprovalState = 'pendente' | 'aprovado' | 'editado' | 'recusado' | 'executado';

export interface QueueItem {
  id?: number;
  ts?: string;
  tool: string;
  action: string;
  content?: string;
  destination?: string;
  reason?: string;
  origin?: string;
  state: ApprovalState;
  updated_at?: string;
  edited_content?: string;
  discord_msg_id?: string;
}

export type AutonomyLevel = 'sozinho' | 'pede_ok' | 'nunca';

export function enqueue(db: Database, item: Omit<QueueItem, 'id' | 'ts' | 'state'>): number {
  const stmt = db.prepare(`
    INSERT INTO approval_queue (tool, action, content, destination, reason, origin)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    item.tool,
    item.action,
    item.content ?? null,
    item.destination ?? null,
    item.reason ?? null,
    item.origin ?? null,
  ]);
  stmt.free();

  const res = db.exec('SELECT last_insert_rowid()');
  persist(db);
  return (res[0]?.values[0]?.[0] as number | undefined) ?? 0;
}

/** Allowed state transitions: nothing reaches `executado` without passing through approval. */
const TRANSITIONS: Record<ApprovalState, ApprovalState[]> = {
  pendente: ['aprovado', 'editado', 'recusado'],
  aprovado: ['executado'],
  editado: ['executado'],
  recusado: [],
  executado: [],
};

export function updateQueueState(
  db: Database,
  id: number,
  state: ApprovalState,
  opts?: { edited_content?: string; discord_msg_id?: string },
): void {
  const item = getQueueItem(db, id);
  if (!item) throw new Error(`Item #${id} não existe na fila`);
  if (!TRANSITIONS[item.state].includes(state)) {
    throw new Error(`Transição inválida na fila: ${item.state} → ${state} (item #${id})`);
  }
  const stmt = db.prepare(`
    UPDATE approval_queue
    SET state = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        edited_content = COALESCE(?, edited_content),
        discord_msg_id = COALESCE(?, discord_msg_id)
    WHERE id = ?
  `);
  stmt.run([state, opts?.edited_content ?? null, opts?.discord_msg_id ?? null, id]);
  stmt.free();
  persist(db);
}

/** Records the Discord message that shows this item, without changing its state. */
export function setQueueDiscordMessage(db: Database, id: number, messageId: string): void {
  const stmt = db.prepare('UPDATE approval_queue SET discord_msg_id = ? WHERE id = ?');
  stmt.run([messageId, id]);
  stmt.free();
  persist(db);
}

function rows(db: Database, sql: string, params: (string | number)[] = []): QueueItem[] {
  const res = db.exec(sql, params);
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    return obj as unknown as QueueItem;
  });
}

export function getPendingItems(db: Database): QueueItem[] {
  return rows(db, `SELECT * FROM approval_queue WHERE state = 'pendente' ORDER BY id`);
}

/** Pending items not yet shown on Discord. */
export function getUnannouncedItems(db: Database): QueueItem[] {
  return rows(db, `SELECT * FROM approval_queue WHERE state = 'pendente' AND discord_msg_id IS NULL ORDER BY id`);
}

/** Items Paulo approved (as is or edited) that still have to be executed. */
export function getApprovedItems(db: Database): QueueItem[] {
  return rows(db, `SELECT * FROM approval_queue WHERE state IN ('aprovado','editado') ORDER BY id`);
}

export function getQueueItem(db: Database, id: number): QueueItem | null {
  return rows(db, 'SELECT * FROM approval_queue WHERE id = ?', [id])[0] ?? null;
}
