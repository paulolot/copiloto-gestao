import type { Database } from 'sql.js';
import { getDb, closeDb } from '../../src/ponte/db/database.js';

/** Fresh in-memory database with the real schema. */
export async function makeTestDb(): Promise<Database> {
  closeDb();
  return getDb();
}
