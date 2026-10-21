/**
 * T0.5 — Autonomy policy
 * Every tool declares its level; the middleware enforces it.
 *
 * sozinho  → executes immediately, logs only
 * pede_ok  → creates approval queue item, returns pending ID to caller
 * nunca    → always rejected, logged as error
 */
import type { Database } from 'sql.js';
import { logAudit } from '../db/audit.js';
import { enqueue } from '../db/queue.js';
import type { AutonomyLevel } from '../db/queue.js';

export interface ToolCall {
  tool: string;
  level: AutonomyLevel;
  action: string;
  params?: Record<string, unknown>;
  content?: string;
  destination?: string;
  reason?: string;
  origin?: string;
}

export type PolicyResult =
  | { allowed: true }
  | { allowed: false; queued: true; queueId: number }
  | { allowed: false; queued: false; reason: string };

export function enforcePolicy(db: Database, call: ToolCall): PolicyResult {
  const start = Date.now();

  if (call.level === 'nunca') {
    logAudit(db, {
      tool: call.tool,
      params: call.params,
      origin: call.origin,
      result: 'error',
      duration_ms: Date.now() - start,
      error_msg: 'Ferramenta bloqueada pela política (nunca)',
    });
    return { allowed: false, queued: false, reason: 'Esta ferramenta nunca é permitida pela política de autonomia.' };
  }

  if (call.level === 'pede_ok') {
    const queueId = enqueue(db, {
      tool: call.tool,
      action: call.action,
      content: call.content,
      destination: call.destination,
      reason: call.reason,
      origin: call.origin,
    });
    logAudit(db, {
      tool: call.tool,
      params: { ...call.params, fila: queueId },
      origin: call.origin,
      result: 'ok',
      duration_ms: Date.now() - start,
    });
    return { allowed: false, queued: true, queueId };
  }

  // sozinho — allowed
  return { allowed: true };
}
