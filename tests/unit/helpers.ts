import type { Database } from 'sql.js';
import { getDb, closeDb } from '../../src/ponte/db/database.js';

/** Fresh in-memory database with the real schema. */
export async function makeTestDb(): Promise<Database> {
  closeDb();
  return getDb();
}

const CONCEITOS: Record<string, string[]> = {
  entrega: ['release', 'deploy', 'publicacao', 'entrega', 'lancamento', 'versao'],
  defeito: ['bug', 'erro', 'defeito', 'falha', 'incidente'],
  contratar: ['contratacao', 'recrutamento', 'vaga', 'candidato', 'entrevista'],
  carreira: ['pdi', 'carreira', 'mentoria', 'promocao', 'crescimento'],
};
const DIM = 32;

/** Deterministic fake: words of the same concept share a dimension, so "deploy" finds "release". */
export class FakeEmbedder {
  constructor(readonly id = 'fake:v1') {}
  async embed(texto: string): Promise<number[]> {
    const v = new Array<number>(DIM + Object.keys(CONCEITOS).length).fill(0);
    const nomes = Object.keys(CONCEITOS);
    for (const w of texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      const c = nomes.findIndex((n) => CONCEITOS[n].includes(w));
      if (c >= 0) v[DIM + c] += 3;
      else { let h = 0; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % DIM; v[h] += 0.2; }
    }
    return v;
  }
}
