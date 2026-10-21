/**
 * T0.5 — Approval executor
 * The only place that acts on queued items, and only on those Paulo approved.
 * A tool registers a handler under its name; items whose tool has no handler stay approved.
 */
import type { Database } from 'sql.js';
import { logAudit } from '../db/audit.js';
import { getApprovedItems, updateQueueState, type QueueItem } from '../db/queue.js';

/** Receives the item and the final content (edited by Paulo, if he edited). */
export type ExecutionHandler = (item: QueueItem, content: string | undefined) => Promise<void>;

export async function executeApproved(
  db: Database,
  handlers: Record<string, ExecutionHandler>,
): Promise<number> {
  let executed = 0;
  for (const item of getApprovedItems(db)) {
    const handler = handlers[item.tool];
    if (!handler || item.id === undefined) continue;
    const start = Date.now();
    try {
      await handler(item, item.state === 'editado' ? (item.edited_content ?? item.content) : item.content);
      updateQueueState(db, item.id, 'executado');
      logAudit(db, {
        tool: item.tool,
        params: { fila: item.id, acao: item.action },
        origin: 'executor',
        result: 'ok',
        duration_ms: Date.now() - start,
      });
      executed++;
    } catch (e) {
      logAudit(db, {
        tool: item.tool,
        params: { fila: item.id, acao: item.action },
        origin: 'executor',
        result: 'error',
        error_msg: (e as Error).message,
        duration_ms: Date.now() - start,
      });
    }
  }
  return executed;
}
