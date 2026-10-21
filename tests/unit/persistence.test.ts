/**
 * The audit log and the queue must survive a restart.
 */
import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getDb, closeDb } from '../../src/ponte/db/database.js';
import { logAudit, queryAudit } from '../../src/ponte/db/audit.js';
import { enqueue, getPendingItems } from '../../src/ponte/db/queue.js';

describe('persistence', () => {
  it('reloads audit log and queue from DB_PATH', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'db-'));
    const path = join(dir, 'copiloto.db');
    closeDb();
    const db = await getDb(path);
    logAudit(db, { tool: 'ping', result: 'ok', params: { token: 'segredo', nested: { password: 'x' } } });
    enqueue(db, { tool: 'discord_postar', action: 'a' });

    closeDb();
    const reopened = await getDb(path);
    const [row] = queryAudit(reopened, 1);
    expect(row.tool).toBe('ping');
    expect(String(row.params)).not.toContain('segredo');
    expect(String(row.params)).not.toContain('"x"');
    expect(getPendingItems(reopened)).toHaveLength(1);
    closeDb();
    rmSync(dir, { recursive: true });
  });
});
