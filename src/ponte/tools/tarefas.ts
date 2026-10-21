/**
 * T1.7 — Paulo's task list (RF-08)
 * An internal list, so level `sozinho`. Each task carries priority, origin (where it came from, to cite)
 * and an optional due date.
 */
import type { Database } from 'sql.js';
import { persist } from '../db/database.js';

export type Prioridade = 'alta' | 'media' | 'baixa';

export interface Tarefa {
  id: number;
  titulo: string;
  prioridade: Prioridade;
  origem?: string;
  prazo?: string;
  estado: 'aberta' | 'feita';
  criadaEm: string;
  concluidaEm?: string;
}

const PESO: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };

export function tarefaCriar(db: Database, t: { titulo: string; prioridade?: Prioridade; origem?: string; prazo?: string }): number {
  if (t.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(t.prazo)) throw new Error('Prazo deve estar no formato AAAA-MM-DD');
  db.run('INSERT INTO tarefas (titulo, prioridade, origem, prazo) VALUES (?,?,?,?)', [t.titulo, t.prioridade ?? 'media', t.origem ?? null, t.prazo ?? null]);
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
  persist(db);
  return id;
}

export function tarefaConcluir(db: Database, id: number): Tarefa {
  const atual = obter(db, id);
  if (!atual) throw new Error(`Tarefa #${id} não existe`);
  if (atual.estado === 'feita') throw new Error(`Tarefa #${id} já está concluída`);
  db.run(`UPDATE tarefas SET estado = 'feita', concluida_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [id]);
  persist(db);
  return obter(db, id)!;
}

function linha(v: unknown[]): Tarefa {
  return {
    id: v[0] as number, titulo: v[1] as string, prioridade: v[2] as Prioridade, origem: (v[3] as string) ?? undefined,
    prazo: (v[4] as string) ?? undefined, estado: v[5] as 'aberta' | 'feita', criadaEm: v[6] as string, concluidaEm: (v[7] as string) ?? undefined,
  };
}
const COLS = 'id, titulo, prioridade, origem, prazo, estado, criada_em, concluida_em';

function obter(db: Database, id: number): Tarefa | undefined {
  const v = db.exec(`SELECT ${COLS} FROM tarefas WHERE id = ?`, [id])[0]?.values[0];
  return v ? linha(v) : undefined;
}

/** Open tasks by priority, then due date (undated last), then creation. */
export function tarefaListar(db: Database, opts: { incluirFeitas?: boolean } = {}): Tarefa[] {
  const r = db.exec(`SELECT ${COLS} FROM tarefas ${opts.incluirFeitas ? '' : "WHERE estado = 'aberta'"}`)[0]?.values ?? [];
  return r.map(linha).sort((a, b) =>
    (a.estado === b.estado ? 0 : a.estado === 'aberta' ? -1 : 1) ||
    PESO[a.prioridade] - PESO[b.prioridade] ||
    (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999') ||
    a.id - b.id);
}
