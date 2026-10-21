/**
 * T0.4 — Audit log
 * Every tool call is recorded: what, when, who called it, result, duration.
 * Restricted vault content is never logged — only the note path.
 */
import type { Database } from 'sql.js';

export interface AuditEntry {
  tool: string;
  params?: Record<string, unknown>;
  origin?: string;
  result: 'ok' | 'error';
  duration_ms?: number;
  error_msg?: string;
  restricted_path?: string; // path only, never content
}

export function logAudit(db: Database, entry: AuditEntry): number {
  // Strip secrets from params before logging
  const safeParams = entry.params ? sanitizeParams(entry.params) : null;

  const stmt = db.prepare(`
    INSERT INTO audit_log (tool, params, origin, result, duration_ms, error_msg, restricted_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    entry.tool,
    safeParams ? JSON.stringify(safeParams) : null,
    entry.origin ?? null,
    entry.result,
    entry.duration_ms ?? null,
    entry.error_msg ?? null,
    entry.restricted_path ?? null,
  ]);
  stmt.free();

  // Return the inserted rowid
  const res = db.exec('SELECT last_insert_rowid()');
  return res[0]?.values[0]?.[0] as number ?? 0;
}

export function queryAudit(db: Database, limit = 50): AuditEntry[] {
  const res = db.exec(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ${limit}`);
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    return obj as unknown as AuditEntry;
  });
}

/** Remove known secret fields from logged parameters */
function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const SECRET_KEYS = ['token', 'password', 'secret', 'key', 'authorization', 'pat'];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (SECRET_KEYS.some((s) => k.toLowerCase().includes(s))) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}
