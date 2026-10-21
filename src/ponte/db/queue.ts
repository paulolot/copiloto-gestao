/**
 * T0.5 — Approval queue
 * Write tools never act directly — they create a queue item and wait for Paulo's OK on Discord.
 */
import type { Database } from 'sql.js';

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
  return res[0]?.values[0]?.[0] as number ?? 0;
}

export function updateQueueState(
  db: Database,
  id: number,
  state: ApprovalState,
  opts?: { edited_content?: string; discord_msg_id?: string },
): void {
  const stmt = db.prepare(`
    UPDATE approval_queue
    SET state = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        edited_content = COALESCE(?, edited_content),
        discord_msg_id = COALESCE(?, discord_msg_id)
    WHERE id = ?
  `);
  stmt.run([state, opts?.edited_content ?? null, opts?.discord_msg_id ?? null, id]);
  stmt.free();
}

export function getPendingItems(db: Database): QueueItem[] {
  const res = db.exec(`SELECT * FROM approval_queue WHERE state = 'pendente' ORDER BY id`);
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    return obj as unknown as QueueItem;
  });
}

export function getQueueItem(db: Database, id: number): QueueItem | null {
  const res = db.exec(`SELECT * FROM approval_queue WHERE id = ${id}`);
  if (!res[0]?.values[0]) return null;
  const cols = res[0].columns;
  const obj: Record<string, unknown> = {};
  cols.forEach((c, i) => (obj[c] = res[0].values[0][i]));
  return obj as unknown as QueueItem;
}
